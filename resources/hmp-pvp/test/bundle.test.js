const assert = require("node:assert");
const path = require("node:path");

const exportsMap = new Map(), handlers = new Map();
const messages = [], emitted = [];
const player = { id: 1, nickname: "Smoke", emit: (name, payload) => emitted.push({ name, payload }), sendChat: (message) => messages.push(message) };
let nativePolicy = null;
global.Exports = { register: (name, value) => exportsMap.set(name, value) };
global.Imports = { get: (name) => name === "hmp-core"
  ? { groups: { has: async () => true } }
  : { logger: { create: () => ({ info() {}, warn() {}, error() {} }) }, config: { load: (_p, o) => o.defaults } } };
global.PlayerManager = { getAll: () => [player], getById: (id) => id === player.id ? player : null };
global.Pvp = { setPolicy: (fn) => { nativePolicy = fn || null; return true; }, getVitals: () => null };
global.Events = { on: (name, handler) => handlers.set(name, handler), emit() {} };
require(path.resolve(__dirname, "..", "dist", "server.js"));
assert.deepStrictEqual([...exportsMap.keys()], ["policy", "mode", "vitals", "status"]);
assert.strictEqual(typeof nativePolicy, "function");
assert.ok(handlers.has("resourceStop"));
assert.ok(handlers.has("chatCommand"));
handlers.get("chatCommand")(player, "", "pvp", ["lethal", "on"]);

setImmediate(() => {
  assert.strictEqual(exportsMap.get("mode").isLethal(), true);
  assert.ok(messages.some((message) => message.includes("LETHAL PvP ON")));
  handlers.get("resourceStop")("hmp-pvp");
  assert.strictEqual(nativePolicy, null);

  const clientExports = new Map(), clientHandlers = new Map(), clientCalls = [];
  global.Exports = { register: (name, value) => clientExports.set(name, value) };
  global.Events = { on: (name, handler) => clientHandlers.set(name, handler) };
  global.Pvp = {
    setTargetable: (id) => clientCalls.push(["targetable", id]),
    resetTeam: () => clientCalls.push(["resetTeam"]),
    setTeam: (team, id) => clientCalls.push(["team", team, id]),
  };
  require(path.resolve(__dirname, "..", "dist", "client.js"));
  assert.deepStrictEqual([...clientExports.keys()], ["mode"]);
  clientHandlers.get("hmp-pvp:mode")(JSON.stringify({ enabled: true, playerIds: [2, 3, 3, -1] }));
  assert.strictEqual(clientExports.get("mode").isLethal(), true);
  assert.ok(clientCalls.some((call) => call[0] === "team" && call[2] === 2));
  assert.ok(clientCalls.some((call) => call[0] === "team" && call[2] === 3));
  clientHandlers.get("resourceStop")("hmp-pvp");
  assert.strictEqual(clientExports.get("mode").isLethal(), false);
  console.log("hmp-pvp bundle contract passed");
});
