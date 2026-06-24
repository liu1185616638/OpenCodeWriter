import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

async function loadTypescript() {
  try {
    const module = await import("typescript");
    return module.default ?? module;
  } catch {
    const module = await import("../node_modules/.pnpm/typescript@5.8.3/node_modules/typescript/lib/typescript.js");
    return module.default ?? module;
  }
}

const ts = await loadTypescript();

const source = fs.readFileSync("src/lib/streaming-display.ts", "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
});

const context = {
  module: { exports: {} },
  exports: {},
};
context.exports = context.module.exports;
vm.runInNewContext(outputText, context);

const {
  nextTypewriterText,
  shouldShowStreamingView,
} = context.module.exports;

assert.equal(nextTypewriterText("", "abcdefghijkl", 6), "abcdef");
assert.equal(nextTypewriterText("abcdef", "abcdefghijkl", 6), "abcdefghijkl");
assert.equal(nextTypewriterText("old", "new content", 3), "new");

assert.equal(shouldShowStreamingView(true, false, false), true);
assert.equal(shouldShowStreamingView(false, true, false), true);
assert.equal(shouldShowStreamingView(false, true, true), false);
assert.equal(shouldShowStreamingView(false, false, false), false);

console.log("streaming-display tests passed");
