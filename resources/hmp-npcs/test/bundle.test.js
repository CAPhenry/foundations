const assert = require("node:assert");
const path = require("node:path");

const exportsMap = new Map();
const handlers = new Map();
let nextId = 10;
global.Exports = { register: (name, value) => exportsMap.set(name, value) };
global.Imports = { get: () => ({ logger: { create: () => ({ info() {}, warn() {}, error() {}, debug() {} }) }, config: { load: (_path, options) => options.defaults } }) };
global.Events = { on: (name, handler) => handlers.set(name, handler) };
global.NPC = { create: (enemyId, _x, _y, _z, disposition = "hostile", ownerId) => ({
    id: nextId++, enemyId, disposition, ownerId, alive: true, scale: 1, health: 100, maxHealth: 100,
    setScale(value) { this.scale = value; }, setMaxHealth(value) { this.maxHealth = value; }, setHealth(value) { this.health = value; }, destroy() { this.alive = false; },
}) };

require(path.resolve(__dirname, "..", "dist", "server.js"));
assert.deepStrictEqual([...exportsMap.keys()], ["catalog", "spawn", "destroy", "clear", "get", "list", "status"]);
assert.strictEqual(exportsMap.get("catalog").list().length, 39);
const npc = exportsMap.get("spawn")({ resource: "smoke", enemyId: "Wolf", position: { x: 0, y: 0, z: 0 } });
assert.strictEqual(npc.id, 10);
handlers.get("npcDied")(10);
assert.strictEqual(exportsMap.get("status")().managed, 0);
require(path.resolve(__dirname, "..", "dist", "client.js"));

console.log("hmp-npcs bundle contract passed");
