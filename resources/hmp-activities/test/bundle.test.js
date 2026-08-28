const assert = require("node:assert");
const path = require("node:path");

const exported = new Map();
const handlers = new Map();
const player = { id: 1, nickname: "Smoke", virtualWorld: 0, location: () => ({ areaId: "Hogwarts", regionId: "GreatHall" }), sendChat() {} };
global.Exports = { register: (name, value) => exported.set(name, value) };
global.Imports = { get: (name) => {
    if (name === "hmp-lib") return {
        logger: { create: () => ({ info() {}, warn() {}, error() {}, debug() {} }) },
        config: { load: (_path, options) => options.defaults, env: { boolean: (_value, fallback) => fallback } },
    };
    if (name === "hmp-core") return { characters: { active: () => ({ id: 1, name: "Smoke" }) } };
    throw new Error(`Unexpected import ${name}`);
} };
global.Events = { on: (name, handler) => handlers.set(name, handler), emit() {} };
require(path.resolve(__dirname, "..", "dist", "server.js"));
assert.deepStrictEqual([...exported.keys()], ["definitions", "sessions", "invitations", "status"]);
assert.ok(handlers.has("playerDisconnect"));
assert.ok(handlers.has("resourceStop"));
assert.ok(handlers.has("chatCommand"));
assert.strictEqual(exported.get("status")().state, "ready");
handlers.get("resourceStop")("hmp-activities");
console.log("hmp-activities bundle contract passed");
