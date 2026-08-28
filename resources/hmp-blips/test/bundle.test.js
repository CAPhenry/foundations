const assert = require("node:assert");
const path = require("node:path");

const serverExports = new Map();
const serverHandlers = new Map();
const broadcasts = [];
const player = {
    id: 1,
    nickname: "Smoke",
    position: { x: 1, y: 2, z: 3 },
    virtualWorld: 0,
    emit() {},
    sendChat() {},
    location: () => ({ areaId: "Hogwarts", regionId: "GreatHall", destinationId: null, x: 1, y: 2, z: 3, yaw: 0, revision: 1 }),
};
const logger = { info() {}, warn() {}, error() {}, debug() {} };
const router = { register() {}, handle() {} };
global.Exports = { register: (name, value) => serverExports.set(name, value) };
global.Imports = { get: (name) => {
    if (name === "hmp-lib") return {
        logger: { create: () => logger },
        text: { clean: (value) => String(value).trim() },
        config: { load: (_path, options) => options.defaults, env: { boolean: (_value, fallback) => fallback } },
        command: { createRouter: () => router },
    };
    if (name === "hmp-core") return { groups: { has: async () => true } };
    throw new Error(`Unexpected import ${name}`);
} };
global.PlayerManager = { getAll: () => [player] };
global.Events = {
    on: (name, handler) => serverHandlers.set(name, handler),
    onClient: (name, handler) => serverHandlers.set(`client:${name}`, handler),
    emit() {},
    emitAllClients: (name, payload) => broadcasts.push({ name, payload }),
};
require(path.resolve(__dirname, "..", "dist", "server.js"));
assert.deepStrictEqual([...serverExports.keys()], ["markers", "players", "status"]);
assert.ok(serverHandlers.has("client:hmp-blips:ready"));
assert.ok(serverHandlers.has("playerLocationChanged"));
assert.ok(broadcasts.some((entry) => entry.name === "hmp-blips:clear"));

const clientExports = new Map();
const clientHandlers = new Map();
const clientEmits = [];
const nativeCalls = [];
global.Exports = { register: (name, value) => clientExports.set(name, value) };
global.Imports = { get: () => ({ logger: { create: () => logger } }) };
global.Events = {
    on: (name, handler) => clientHandlers.set(name, handler),
    emitServer: (name, payload) => clientEmits.push({ name, payload }),
};
global.Blips = {
    setMarker: (...args) => { nativeCalls.push(["marker", ...args]); return true; },
    setCircle: (...args) => { nativeCalls.push(["circle", ...args]); return true; },
    remove: () => true,
    clear() {},
    pulseCircle: () => true,
    setPlayerColor() {},
    setTrackedPlayers() {},
    trackAllPlayers() {},
    setHouseTint: () => true,
    setBlipScale() {},
    hideBaseIcon() {},
};
require(path.resolve(__dirname, "..", "dist", "client.js"));
assert.deepStrictEqual([...clientExports.keys()], ["status"]);
assert.deepStrictEqual(clientEmits.map((entry) => entry.name), ["hmp-blips:ready"]);
clientHandlers.get("hmp-blips:set")({ key: "smoke", kind: "marker", x: 1, y: 2, z: 3 });
assert.ok(nativeCalls.some((entry) => entry[0] === "marker"));
clientHandlers.get("resourceStop")("hmp-blips");
assert.strictEqual(clientExports.get("status")().state, "stopped");
console.log("hmp-blips bundle contract passed");
