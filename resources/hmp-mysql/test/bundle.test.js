const assert = require("node:assert");
const path = require("node:path");

const exportsSeen = new Map();
global.Exports = { register: (name, value) => exportsSeen.set(name, value) };
global.Events = { on: () => {} };

require(path.resolve(__dirname, "..", "dist", "main.js"));

const expected = ["query", "prepare", "single", "scalar", "insert", "update", "transaction", "ready", "status"];
assert.deepStrictEqual([...exportsSeen.keys()], expected);
for (const name of expected) assert.strictEqual(typeof exportsSeen.get(name), "function");
assert.strictEqual(exportsSeen.get("status")().state, "disabled");
console.log("hmp-mysql bundle contract passed");
