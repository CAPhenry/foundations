const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const serverExports = new Map();
global.Exports = { register: (name, value) => serverExports.set(name, value) };
global.PlayerManager = { getAll: () => [{ id: 7, nickname: "Poppy" }] };

require(path.resolve(__dirname, "..", "dist", "server.js"));

const shared = ["text", "number", "position", "validation", "rateLimit", "locale", "logger"];
const server = [...shared, "config", "player", "command"];
assert.deepStrictEqual([...serverExports.keys()], server);
assert.strictEqual(serverExports.get("player").find("#7").nickname, "Poppy");
assert.strictEqual(serverExports.get("text").clean("  hello  "), "hello");

const clientExports = new Map();
global.Exports = { register: (name, value) => clientExports.set(name, value) };
global.Key = { bind: () => true, unbind: () => true, isDown: () => false };
global.Game = { lockControls() {}, areControlsLocked: () => false };
global.Events = { on() {} };
require(path.resolve(__dirname, "..", "dist", "client.js"));
assert.deepStrictEqual([...clientExports.keys()], [...shared, "input"]);
assert.strictEqual(clientExports.get("position").distance({ x: 0, y: 0, z: 0 }, { x: 0, y: 3, z: 4 }), 5);

const clientBundle = fs.readFileSync(path.resolve(__dirname, "..", "dist", "client.js"), "utf8");
assert.ok(!clientBundle.includes("node:fs"));
assert.ok(!clientBundle.includes("PlayerManager"));
console.log("hmp-lib bundle contract passed");
