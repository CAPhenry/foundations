const assert = require("node:assert");
const path = require("node:path");

const serverExports = new Map();
const serverHandlers = new Map();
const player = { id: 1, nickname: "Smoke", position: { x: 1, y: 2, z: 3 }, emit() {}, sendChat() {} };
const logger = { info() {}, warn() {}, error() {}, debug() {} };
const router = { register() {}, handle() {} };
global.Exports = { register: (name, value) => serverExports.set(name, value) };
global.Imports = { get: (name) => {
    if (name !== "hmp-lib") throw new Error(`Unexpected import ${name}`);
    return {
        logger: { create: () => logger },
        text: { clean: (value) => String(value).trim() },
        config: { load: (_path, options) => options.defaults, env: { boolean: (_value, fallback) => fallback } },
        command: { createRouter: () => router },
    };
} };
global.PlayerManager = { getAll: () => [player] };
global.Events = {
    on: (name, handler) => serverHandlers.set(name, handler),
    onClient: (name, handler) => serverHandlers.set(`client:${name}`, handler),
    emit() {},
};
let serverSoundId = 10;
global.Audio = {
    playSoundAt: () => ++serverSoundId,
    playSoundOnPlayer: () => ++serverSoundId,
    playSoundForPlayer: () => ++serverSoundId,
    playSoundForAll: () => ++serverSoundId,
    stopSound: () => true,
    stopEventFor: () => "",
    bankFor: () => "",
    loadBank() {},
    unloadBank() {},
};
require(path.resolve(__dirname, "..", "dist", "server.js"));
assert.deepStrictEqual([...serverExports.keys()], ["sounds", "catalog", "banks", "status"]);
assert.ok(serverHandlers.has("client:hmp-audio:ready"));
assert.ok(serverHandlers.has("resourceStop"));
const serverHandle = serverExports.get("sounds").playAt({ resource: "smoke" }, "click", player.position);
assert.ok(serverHandle);
assert.strictEqual(serverExports.get("sounds").stop({ resource: "smoke" }, serverHandle), true);

const clientExports = new Map();
const clientHandlers = new Map();
const clientEmits = [];
global.Exports = { register: (name, value) => clientExports.set(name, value) };
global.Imports = { get: () => ({ logger: { create: () => logger } }) };
global.Events = {
    on: (name, handler) => clientHandlers.set(name, handler),
    emitServer: (name, payload) => clientEmits.push({ name, payload }),
};
let clientSoundId = 20;
global.Audio = {
    playSound: () => ++clientSoundId,
    playSoundAt: () => ++clientSoundId,
    stopSound: () => true,
    stopEventFor: () => "",
    bankFor: () => "",
    loadBank: () => true,
    unloadBank: () => true,
};
require(path.resolve(__dirname, "..", "dist", "client.js"));
assert.deepStrictEqual([...clientExports.keys()], ["sounds", "catalog", "banks", "status"]);
assert.deepStrictEqual(clientEmits.map((entry) => entry.name), ["hmp-audio:ready"]);
assert.ok(clientHandlers.has("hmp-audio:catalog"));
assert.strictEqual(clientHandlers.get("hmp-audio:catalog")({ aliases: { custom: "Custom_Play" } }), undefined);
const localHandle = clientExports.get("sounds").play({ resource: "smoke" }, "custom");
assert.ok(localHandle);
clientHandlers.get("resourceStop")("smoke");
assert.strictEqual(clientExports.get("sounds").get(localHandle), null);
clientHandlers.get("resourceStop")("hmp-audio");
console.log("hmp-audio bundle contract passed");
