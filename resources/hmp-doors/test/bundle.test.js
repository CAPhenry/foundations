const assert = require("node:assert");
const path = require("node:path");

const serverExports = new Map();
const serverHandlers = new Map();
const logger = { info() {}, warn() {}, error() {}, debug() {} };
const player = { id: 1, nickname: "Smoke", emit() {}, sendChat() {} };
const core = {
    characters: { active: () => null },
    groups: { effective: async () => [], has: async () => true },
    metadata: { getCharacter: async () => [], setCharacter: async (_id, _key, value) => value },
};
global.Exports = { register: (name, value) => serverExports.set(name, value) };
global.Imports = { get: (name) => {
    if (name === "hmp-lib") return {
        logger: { create: () => logger },
        config: { load: (_path, options) => options.defaults, env: { boolean: (_value, fallback) => fallback } },
        player: { find: () => player },
    };
    if (name === "hmp-core") return core;
    throw new Error(`Unexpected import ${name}`);
} };
global.PlayerManager = { getAll: () => [player] };
global.Events = {
    on: (name, handler) => serverHandlers.set(name, handler),
    onClient: (name, handler) => serverHandlers.set(`client:${name}`, handler),
};
require(path.resolve(__dirname, "..", "dist", "server.js"));
assert.deepStrictEqual([...serverExports.keys()], ["policy", "grants", "status"]);
assert.ok(serverHandlers.has("client:hmp-doors:ready"));
assert.ok(serverHandlers.has("hmp:groups:changed"));

const clientExports = new Map();
const clientHandlers = new Map();
const clientEmits = [];
global.Exports = { register: (name, value) => clientExports.set(name, value) };
global.Events = {
    on: (name, handler) => clientHandlers.set(name, handler),
    emitServer: (name, payload) => clientEmits.push({ name, payload }),
};
global.Doors = {
    setLock: () => true, superAlohomora: () => true, list: () => [], openNearby: () => 0,
    unlockNearby: () => 0, setOpen: () => true, setPolicy() {},
};
global.Game = { notify() {} };
require(path.resolve(__dirname, "..", "dist", "client.js"));
assert.deepStrictEqual([...clientExports.keys()], ["status", "list"]);
assert.ok(clientHandlers.has("hmp-doors:policy"));
assert.deepStrictEqual(clientEmits.map((event) => event.name), ["hmp-doors:ready"]);
clientHandlers.get("hmp-doors:policy")({ unlockAll: true });
clientHandlers.get("resourceStop")("hmp-doors");
console.log("hmp-doors bundle contract passed");
