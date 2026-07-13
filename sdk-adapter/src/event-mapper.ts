import type { AdapterEvent } from "./protocol.js";

export function collectTextFromSdkResult(result: unknown): string {
  const root = result as { data?: unknown };
  const data = root && typeof root === "object" && "data" in root ? root.data : result;
  const parts = findFirstArrayByKey(data, "parts");
  if (parts) {
    const text = parts.map(collectTextNode).join("");
    if (text.trim()) return text;
  }
  return collectTextNode(data).trim();
}

export function mapSdkEvent(event: unknown): AdapterEvent | null {
  const value = event as { type?: unknown; properties?: unknown };
  const type = typeof value?.type === "string" ? value.type : "";
  const properties = value?.properties;

  if (type === "message.part.updated") {
    return mapMessagePartUpdated(properties);
  }

  const text = collectTextNode(properties).trim();

  if (!text) return null;
  if (type.toLowerCase().includes("reason") || type.toLowerCase().includes("think")) {
    return { type: "thinking", text, payload: properties };
  }
  if (type.toLowerCase().includes("message") || type.toLowerCase().includes("part")) {
    return { type: "content", text, payload: properties };
  }
  return null;
}

function mapMessagePartUpdated(properties: unknown): AdapterEvent | null {
  if (!properties || typeof properties !== "object") return null;
  const record = properties as Record<string, unknown>;
  const part = record.part;
  if (!part || typeof part !== "object") return null;
  const partRecord = part as Record<string, unknown>;
  const partType = typeof partRecord.type === "string" ? partRecord.type : "";
  const delta = typeof record.delta === "string" ? record.delta : "";
  const text = delta || (typeof partRecord.text === "string" ? partRecord.text : "");
  if (!text) return null;

  if (partType === "reasoning") {
    return { type: "thinking", text, payload: properties };
  }
  if (partType === "text") {
    return { type: "content", text, payload: properties };
  }
  if (partType === "tool") {
    return { type: "tool_call", text: typeof partRecord.tool === "string" ? partRecord.tool : "tool", payload: properties };
  }
  return null;
}

function findFirstArrayByKey(value: unknown, key: string): unknown[] | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstArrayByKey(item, key);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  if (Array.isArray(record[key])) return record[key] as unknown[];
  for (const child of Object.values(record)) {
    const found = findFirstArrayByKey(child, key);
    if (found) return found;
  }
  return null;
}

function collectTextNode(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(collectTextNode).join("");
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  if (typeof record.text === "string") return record.text;
  if (typeof record.content === "string") return record.content;
  return Object.values(record).map(collectTextNode).join("");
}
