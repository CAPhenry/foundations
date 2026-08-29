const assert = require("node:assert");
const path = require("node:path");

const exportsMap = new Map();
const handlers = new Map();
const logger = { info() {}, warn() {}, error() {}, debug() {} };
const player = { id: 1, nickname: "Smoke", house: "Unaffiliated", sendChat() {} };
const database = {
    transaction: async (work) => typeof work === "function" ? work(database) : [],
    migrate: async () => ({ applied: [], skipped: [], currentVersion: 1 }),
    query: async (sql) => sql.includes("status = 'pending'") ? [] : [],
    single: async () => null, scalar: async () => null, insert: async () => 1, update: async () => 0,
};
const core = {
    characters: { active: () => null },
    sessions: { all: () => [] },
    groups: { has: async () => true, listCharacter: async () => [], setCharacter: async () => ({}), removeCharacter: async () => false },
};
global.Exports = { register: (name, value) => exportsMap.set(name, value) };
global.Imports = { get: (name) => {
    if (name === "hmp-lib") return {
        logger: { create: () => logger },
        config: { load: (_path, options) => options.defaults, env: { boolean: (_value, fallback) => fallback } },
        player: { find: () => player },
    };
    if (name === "hmp-mysql") return database;
    if (name === "hmp-core") return core;
    throw new Error(`Unexpected import ${name}`);
} };
global.Events = {
    on: (name, handler) => handlers.set(name, handler),
    emit() {},
};
require(path.resolve(__dirname, "..", "dist", "server.js"));
assert.deepStrictEqual([...exportsMap.keys()], ["membership", "points", "status"]);
assert.ok(handlers.has("hmp:character:loaded"));
assert.ok(handlers.has("hmp:character:unloaded"));
assert.ok(handlers.has("playerDisconnect"));
assert.ok(handlers.has("resourceStop"));

const disconnectedPlayer = { id: 2, nickname: "Gone" };
Object.defineProperty(disconnectedPlayer, "house", {
    set() { throw new Error("Player is not connected"); },
});
assert.doesNotThrow(() => handlers.get("hmp:character:unloaded")({ session: { player: disconnectedPlayer } }));
console.log("hmp-houses bundle contract passed");
