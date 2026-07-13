import test from "node:test";
import assert from "node:assert/strict";
import { mapSdkEvent } from "./event-mapper.js";

test("maps message part delta as incremental content", () => {
  const event = {
    type: "message.part.updated",
    properties: {
      part: {
        id: "part-1",
        sessionID: "session-1",
        messageID: "message-1",
        type: "text",
        text: "hello",
      },
      delta: "lo",
    },
  };

  assert.deepEqual(mapSdkEvent(event), {
    type: "content",
    text: "lo",
    payload: event.properties,
  });
});

test("maps reasoning part delta as thinking", () => {
  const event = {
    type: "message.part.updated",
    properties: {
      part: {
        id: "part-1",
        sessionID: "session-1",
        messageID: "message-1",
        type: "reasoning",
        text: "plan",
      },
      delta: "an",
    },
  };

  assert.deepEqual(mapSdkEvent(event), {
    type: "thinking",
    text: "an",
    payload: event.properties,
  });
});
