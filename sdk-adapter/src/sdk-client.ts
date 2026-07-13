import { createOpencode } from "@opencode-ai/sdk";
import { collectTextFromSdkResult, mapSdkEvent } from "./event-mapper.js";
import type { AdapterEvent, AdapterRequest } from "./protocol.js";

type RunRequest = Extract<AdapterRequest, { type: "run" }>;
type RunResult = {
  content: string;
  streamed: boolean;
};

export async function runSdkRequest(
  message: RunRequest,
  emit?: (event: AdapterEvent) => void,
): Promise<RunResult> {
  assertMcpDisabled(message);
  const model = parseModelName(message.preset.model_name);
  const opencode = await createOpencode({
    config: {
      ...(model ? { model: `${model.providerID}/${model.modelID}` } : {}),
    },
  });

  try {
    const client = opencode.client;
    if (model && message.preset.api_key) {
      await setProviderAuth(client, model.providerID, message.preset.api_key);
    }

    const sessionResult = await client.session.create({
      body: { title: `OpenCodeWriter ${message.request.task_type}` },
    });
    const session = unwrapData(sessionResult) as { id?: string };
    if (!session.id) {
      throw new Error("SDK session.create did not return a session id");
    }

    if (emit && message.request.stream) {
      return await runStreamingPrompt(client, session.id, message, model, emit);
    }

    const result = await client.session.prompt({
      path: { id: session.id },
      body: {
        ...(model ? { model } : {}),
        parts: [{ type: "text", text: messagesToPrompt(message.request.messages) }],
      },
    });

    return { content: collectTextFromSdkResult(result), streamed: false };
  } finally {
    opencode.server.close();
  }
}

async function runStreamingPrompt(
  client: unknown,
  sessionId: string,
  message: RunRequest,
  model: { providerID: string; modelID: string } | null,
  emit: (event: AdapterEvent) => void,
): Promise<RunResult> {
  const typedClient = client as {
    event: {
      subscribe: (options?: unknown) => Promise<{ stream: AsyncGenerator<unknown> }>;
    };
    session: {
      promptAsync: (options: unknown) => Promise<unknown>;
    };
  };
  const abortController = new AbortController();
  const events = await typedClient.event.subscribe({
    signal: abortController.signal,
    sseMaxRetryAttempts: 0,
  });
  let content = "";
  let sawStreamEvent = false;

  const streamTask = (async () => {
    for await (const sdkEvent of events.stream) {
      if (!eventBelongsToSession(sdkEvent, sessionId)) continue;

      const error = getSessionError(sdkEvent);
      if (error) {
        throw new Error(error);
      }

      const adapterEvent = mapSdkEvent(sdkEvent);
      if (adapterEvent) {
        sawStreamEvent = true;
        if (adapterEvent.type === "content") {
          content += adapterEvent.text ?? "";
        }
        emit(adapterEvent);
      }

      if (isSessionIdle(sdkEvent, sessionId)) {
        break;
      }
    }
  })();

  try {
    await typedClient.session.promptAsync({
      path: { id: sessionId },
      body: {
        ...(model ? { model } : {}),
        parts: [{ type: "text", text: messagesToPrompt(message.request.messages) }],
      },
    });
    await streamTask;
  } finally {
    abortController.abort();
  }

  return { content, streamed: sawStreamEvent };
}

function messagesToPrompt(messages: RunRequest["request"]["messages"]): string {
  return messages
    .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
    .join("\n\n");
}

function parseModelName(modelName: string): { providerID: string; modelID: string } | null {
  const [providerID, ...modelParts] = modelName.split("/");
  if (!providerID || modelParts.length === 0) return null;
  return { providerID, modelID: modelParts.join("/") };
}

function eventBelongsToSession(event: unknown, sessionId: string): boolean {
  const eventSessionId = getSessionId(event);
  return eventSessionId === null || eventSessionId === sessionId;
}

function getSessionId(event: unknown): string | null {
  if (!event || typeof event !== "object") return null;
  const value = event as { properties?: unknown };
  const properties = value.properties;
  if (!properties || typeof properties !== "object") return null;
  const record = properties as Record<string, unknown>;
  if (typeof record.sessionID === "string") return record.sessionID;
  const part = record.part;
  if (part && typeof part === "object" && typeof (part as Record<string, unknown>).sessionID === "string") {
    return (part as Record<string, string>).sessionID;
  }
  const info = record.info;
  if (info && typeof info === "object") {
    const infoRecord = info as Record<string, unknown>;
    if (typeof infoRecord.sessionID === "string") return infoRecord.sessionID;
    if (typeof infoRecord.id === "string" && getEventType(event).startsWith("session.")) return infoRecord.id;
  }
  return null;
}

function getEventType(event: unknown): string {
  if (!event || typeof event !== "object") return "";
  const type = (event as { type?: unknown }).type;
  return typeof type === "string" ? type : "";
}

function isSessionIdle(event: unknown, sessionId: string): boolean {
  const type = getEventType(event);
  if (type === "session.idle" && getSessionId(event) === sessionId) return true;
  if (type !== "session.status") return false;
  const properties = (event as { properties?: unknown }).properties;
  if (!properties || typeof properties !== "object") return false;
  const record = properties as Record<string, unknown>;
  const status = record.status;
  return (
    record.sessionID === sessionId &&
    !!status &&
    typeof status === "object" &&
    (status as Record<string, unknown>).type === "idle"
  );
}

function getSessionError(event: unknown): string | null {
  if (getEventType(event) !== "session.error") return null;
  const properties = (event as { properties?: unknown }).properties;
  if (!properties || typeof properties !== "object") return "SDK session error";
  const error = (properties as Record<string, unknown>).error;
  if (!error) return "SDK session error";
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    const data = record.data;
    if (data && typeof data === "object" && typeof (data as Record<string, unknown>).message === "string") {
      return (data as Record<string, string>).message;
    }
    if (typeof record.message === "string") return record.message;
    if (typeof record.name === "string") return record.name;
  }
  return String(error);
}

function assertMcpDisabled(message: RunRequest): void {
  const permissionPolicy = message.request.permission_policy;
  const allowMcp =
    permissionPolicy &&
    typeof permissionPolicy === "object" &&
    "allow_mcp" in permissionPolicy &&
    (permissionPolicy as { allow_mcp?: unknown }).allow_mcp === true;

  if (message.request.mcp_servers.length > 0 || allowMcp) {
    throw new Error("SDK Adapter MCP execution is not enabled; configure MCP through OpenCodeWriter approval flow first");
  }
}

async function setProviderAuth(client: unknown, providerID: string, apiKey: string): Promise<void> {
  const auth = (client as { auth?: { set?: (args: unknown) => Promise<unknown> } }).auth;
  if (!auth?.set) return;
  await auth.set({
    path: { id: providerID },
    body: { type: "api", key: apiKey },
  });
}

function unwrapData(value: unknown): unknown {
  if (value && typeof value === "object" && "data" in value) {
    return (value as { data: unknown }).data;
  }
  return value;
}
