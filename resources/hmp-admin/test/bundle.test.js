const assert = require("node:assert");
const path = require("node:path");

const exportsSeen = new Map();
const handlers = new Map();
const logger = { debug() {}, info() {}, warn() {}, error() {} };
const database = {
    ready: async () => true,
    migrate: async () => ({ applied: [1] }),
    query: async () => [], single: async () => null,
    insert: async () => 1, update: async () => 1,
};
const core = {
    sessions: { get: () => null, all: () => [] },
    groups: { effective: async () => [] },
};
const ui = { notify: () => true, input: async () => null, context: async () => null, close: () => true };
const banking = { transactions: { pending: async () => [] } };

global.Exports = { register: (name, value) => exportsSeen.set(name, value) };
global.Imports = {
    get(name) {
        if (name === "hmp-mysql") return database;
        if (name === "hmp-core") return core;
        if (name === "hmp-ui") return ui;
        if (name === "hmp-inventory") return { inventory: {} };
        if (name === "hmp-banking") return banking;
        if (name === "hmp-jobs") return { employment: {} };
        if (name === "hmp-lib") return {
            logger: { create: () => logger },
            config: { load: (_path, options) => ({ ...options.defaults }), env: { boolean: (_value, fallback) => fallback } },
            command: { createRouter: () => ({ register() {}, handle() {} }) },
        };
        throw new Error(`Unexpected import ${name}`);
    },
};
global.Events = { on: (name, handler) => handlers.set(name, handler) };
global.PlayerManager = { getAll: () => [], getById: () => null };

require(path.resolve(__dirname, "..", "dist", "server.js"));

assert.deepStrictEqual([...exportsSeen.keys()], ["permissions", "players", "actions", "moderation", "audit", "status", "ui"]);
assert.ok(handlers.has("hmp:session:ready"));
assert.ok(handlers.has("playerDisconnect"));
assert.ok(handlers.has("playerTeleportComplete"));
assert.ok(handlers.has("chatCommand"));
assert.ok(handlers.has("resourceStop"));
assert.strictEqual(exportsSeen.get("status")().bootstrapEnabled, false);
console.log("hmp-admin bundle contract passed");
