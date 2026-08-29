const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const exportsSeen = new Map();
const handlers = new Map();
global.Exports = { register: (name, value) => exportsSeen.set(name, value) };
global.Events = { on: (name, handler) => handlers.set(name, handler) };

require(path.resolve(__dirname, "..", "dist", "main.js"));

const expected = ["query", "prepare", "single", "scalar", "insert", "update", "transaction", "migrate", "ready", "status"];
assert.deepStrictEqual([...exportsSeen.keys()], expected);
for (const name of expected) assert.strictEqual(typeof exportsSeen.get(name), "function");
assert.strictEqual(exportsSeen.get("status")().state, "disabled");
assert.ok(handlers.has("resourceStart"));
const clientSource = fs.readFileSync(path.resolve(__dirname, "..", "dist", "client.js"), "utf8");
assert.ok(clientSource.includes("client dependency shim ready"));
void (async () => {
    await assert.rejects(() => handlers.get("resourceStart")("hmp-mysql"), /hmp-mysql is not configured/);
    console.log("hmp-mysql bundle contract passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
