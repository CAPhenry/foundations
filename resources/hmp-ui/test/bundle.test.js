const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const serverExports = new Map();
const serverHandlers = new Map();
const logger = { info() {}, warn() {}, error() {}, debug() {} };
global.Exports = { register: (name, value) => serverExports.set(name, value) };
const input = { controls: { acquire: () => ({ release: () => true }) } };
global.Imports = { get: (name) => {
    if (name === "hmp-lib") return { logger: { create: () => logger }, input };
    throw new Error(`Unexpected import ${name}`);
} };
global.Events = {
    on: (name, handler) => serverHandlers.set(name, handler),
    onClient: (name, handler) => serverHandlers.set(`client:${name}`, handler),
};

require(path.resolve(__dirname, "..", "dist", "server.js"));
assert.deepStrictEqual([...serverExports.keys()], ["notify", "alert", "input", "context", "progress", "close", "status"]);
assert.ok(serverHandlers.has("client:hmp-ui:response"));
assert.ok(serverHandlers.has("playerDisconnect"));

const clientExports = new Map();
const clientHandlers = new Map();
const webHandlers = new Map();
const pageEvents = [];
global.Exports = { register: (name, value) => clientExports.set(name, value) };
global.Events = {
    on: (name, handler) => clientHandlers.set(name, handler),
    emitServer() {},
};
global.Web = {
    createView: () => 1,
    destroyView: () => true,
    showView: () => true,
    hideView: () => true,
    focusView: () => true,
    emit: (_view, name, payload) => pageEvents.push({ name, payload }),
    on: (_view, name, handler) => webHandlers.set(name, handler),
};
global.Game = { notify() {}, lockControls() {}, areControlsLocked: () => false };

require(path.resolve(__dirname, "..", "dist", "client.js"));
assert.deepStrictEqual([...clientExports.keys()], ["notify", "alert", "input", "context", "progress", "close", "status"]);
assert.ok(clientHandlers.has("hmp-ui:request"));
assert.ok(clientHandlers.has("hmp-ui:notify"));
clientExports.get("notify")("Bundle ready");
assert.ok(webHandlers.has("ready"));
assert.ok(webHandlers.has("response"));
assert.ok(fs.existsSync(path.resolve(__dirname, "..", "dist", "index.html")));
console.log("hmp-ui bundle contract passed");
