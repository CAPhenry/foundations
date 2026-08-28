const assert = require("node:assert"); const path = require("node:path");
const serverExports = new Map(), serverHandlers = new Map();
const player = { id: 1, nickname: "Smoke", emit() {}, sendChat() {} };
const activity = {
  definitions: { register: () => async () => 0 },
  sessions: { forPlayer: () => [], get: () => null, create: async () => { throw new Error("unused"); }, cancel: async () => {}, complete: async () => {}, start: async () => {} },
  invitations: { list: () => [], invite: async () => {}, accept: async () => {}, decline: async () => {}, cancel: async () => {} },
};
const pvp = { policy: { register: () => () => true }, status: () => ({}) };
const ui = { notify() {}, alert: async () => null, close() {} };
global.Exports = { register: (name, value) => serverExports.set(name, value) };
global.Imports = { get: (name) => name === "hmp-lib" ? { logger: { create: () => ({ info() {}, warn() {}, error() {} }) }, config: { load: (_p, o) => o.defaults }, player: { find: () => null } } : name === "hmp-core" ? {} : name === "hmp-activities" ? activity : name === "hmp-pvp" ? pvp : ui };
global.PlayerManager = { getById: () => player };
global.Events = { on: (name, handler) => serverHandlers.set(name, handler) };
require(path.resolve(__dirname, "..", "dist", "server.js"));
assert.deepStrictEqual([...serverExports.keys()], ["challenge", "accept", "decline", "cancel", "forfeit", "status"]);
assert.ok(serverHandlers.has("playerDied")); assert.ok(serverHandlers.has("hmp:activities:invitation:expired"));

const clientHandlers = new Map(), calls = [];
global.Events = { on: (name, handler) => clientHandlers.set(name, handler), emitServer() {} };
global.Pvp = { endDuelContext() {}, setTargetable() {}, resetTeam() {}, showMeter() {}, startDuelContext() {}, setTeam() {}, kneel: () => "ok" };
let restored = 0;
global.Imports = { get: () => ({ mode: { restore: () => { restored++; return true; } } }) };
global.LocalPlayer = { stateInfo: { setInvulnerableToDamage() {} } }; global.Game = { notify: (value) => calls.push(value) };
require(path.resolve(__dirname, "..", "dist", "client.js"));
assert.ok(clientHandlers.has("hmp-duels:countdown")); assert.ok(clientHandlers.has("hmp-duels:end"));
clientHandlers.get("hmp-duels:end")({ result: "win", opponentName: "Smoke" });
assert.ok(calls.some((value) => String(value).includes("Victory")));
assert.ok(restored >= 2);
console.log("hmp-duels bundle contract passed");
