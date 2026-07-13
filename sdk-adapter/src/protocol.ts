export type ChatMessage = {
  role: string;
  content: string;
};

export type ModelPreset = {
  id: number;
  name: string;
  api_base: string;
  api_key: string;
  model_name: string;
  created_at: string;
};

export type AdapterRequest =
  | { type: "ping"; id?: string }
  | {
      type: "run";
      id: string;
      request: {
        task_type: string;
        messages: ChatMessage[];
        stream: boolean;
        output_schema?: unknown;
        tools: string[];
        skills: string[];
        mcp_servers: string[];
        thinking: unknown;
        permission_policy: unknown;
        metadata: unknown;
      };
      preset: ModelPreset;
    }
  | { type: "abort"; id: string };

export type AdapterEvent = {
  type:
    | "pong"
    | "content"
    | "thinking"
    | "thinking_summary"
    | "tool_call"
    | "tool_result"
    | "skill_start"
    | "skill_result"
    | "mcp_call"
    | "mcp_result"
    | "error"
    | "done";
  text?: string;
  payload?: unknown;
};

export function parseAdapterRequest(line: string): AdapterRequest {
  const value = JSON.parse(line) as AdapterRequest;
  if (!value || typeof value !== "object" || !("type" in value)) {
    throw new Error("Adapter request missing type");
  }
  return value;
}

export function writeEvent(event: AdapterEvent): void {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}
