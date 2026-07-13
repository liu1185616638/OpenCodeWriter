import { createInterface } from "node:readline";
import { parseAdapterRequest, writeEvent } from "./protocol.js";
import { runSdkRequest } from "./sdk-client.js";

async function handleLine(line: string): Promise<void> {
  const message = parseAdapterRequest(line);

  if (message.type === "ping") {
    writeEvent({ type: "pong", text: "ok" });
    writeEvent({ type: "done" });
    return;
  }

  if (message.type === "abort") {
    writeEvent({ type: "done" });
    return;
  }

  const result = await runSdkRequest(message, writeEvent);
  if (!result.streamed && result.content) {
    writeEvent({ type: "content", text: result.content });
  }
  writeEvent({ type: "done" });
}

async function main(): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      await handleLine(line);
    } catch (error) {
      writeEvent({
        type: "error",
        text: error instanceof Error ? error.message : String(error),
      });
      writeEvent({ type: "done" });
    }
  }
}

void main();
