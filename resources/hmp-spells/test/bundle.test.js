const assert = require("node:assert");
const path = require("node:path");

const serverExports = new Map();
const serverHandlers = new Map();
const logger = { info() {}, warn() {}, error() {}, debug() {} };
const player = { id: 1, nickname: "Smoke", emit() {}, sendChat() {} };
const core = {
    characters: { active: () => null },
    groups: { effective: async () => [], has: async () => true },
    metadata: { getCharacter: async () => undefined, setCharacter: async (_id, _key, value) => value },
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
    emit() {},
};
require(path.resolve(__dirname, "..", "dist", "server.js"));
assert.deepStrictEqual([...serverExports.keys()], ["catalog", "policy", "rules", "grants", "loadouts", "status"]);
assert.ok(serverHandlers.has("client:hmp-spells:ready"));
assert.ok(serverHandlers.has("client:hmp-spells:cast"));
assert.ok(serverHandlers.has("hmp:groups:changed"));

const clientExports = new Map();
const clientHandlers = new Map();
const clientEmits = [];
global.Exports = { register: (name, value) => clientExports.set(name, value) };
global.Events = {
    on: (name, handler) => clientHandlers.set(name, handler),
    emitServer: (name, payload) => clientEmits.push({ name, payload }),
};
global.Spells = {
    setPolicy() {}, loadout: () => null, setLoadoutSlot: () => true,
    cast: (slot) => ({ accepted: true, slot, spellName: "Lumos", reason: null }),
};
global.Game = { notify() {} };
require(path.resolve(__dirname, "..", "dist", "client.js"));
assert.deepStrictEqual([...clientExports.keys()], ["clientStatus", "loadout", "setLoadoutSlot", "cast"]);
assert.ok(clientHandlers.has("hmp-spells:policy"));
assert.ok(clientHandlers.has("spellCast"));
assert.deepStrictEqual(clientEmits.map((event) => event.name), ["hmp-spells:ready"]);
clientHandlers.get("hmp-spells:policy")({ unlockSpells: ["Spell_Lumos"], bonusLoadouts: null });
clientHandlers.get("spellCast")("/Game/Spells/Lumos/DA_LumosSpellRecord");
clientHandlers.get("resourceStop")("hmp-spells");
console.log("hmp-spells bundle contract passed");
