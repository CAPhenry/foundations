import assert = require("node:assert");
import policyModule = require("../server/policy");
import configModule = require("../server/config");
import serviceModule = require("../server/service");
import clientModule = require("../client/doors");
import type { HmpDoorRule } from "../types";

const { evaluateRules } = policyModule;
const { normalizeRule } = configModule;
const { createDoorService, METADATA_KEY } = serviceModule;
const { createDoorClient } = clientModule;

async function run(): Promise<void> {
    const rules: HmpDoorRule[] = [
        normalizeRule({ priority: 1000, action: "allow", doors: "*" }, 0),
        normalizeRule({ priority: 1000, action: "deny", doors: ["Headmaster"] }, 1),
        normalizeRule({ priority: 500, action: "allow", doors: ["Headmaster"], match: { groups: [{ key: "staff", minimumGrade: 2 }] } }, 2),
        normalizeRule({ priority: 800, action: "allow", locks: ["GateLock"] }, 3),
        normalizeRule({ priority: 700, action: "allow", alohomora: true, match: { groups: [{ key: "job:auror" }] } }, 4),
    ];
    const guest = evaluateRules(rules, [], []);
    assert.strictEqual(guest.unlockAll, true);
    assert.deepStrictEqual(guest.unlockAllExcept, ["Headmaster"]);
    assert.deepStrictEqual(guest.unlockLocks, ["GateLock"]);
    assert.strictEqual(guest.superAlohomora, false);

    const staff = evaluateRules(rules, [{ key: "staff", grade: 2 }], ["SecretPassage"]);
    assert.deepStrictEqual(staff.unlockAllExcept, []);
    assert.deepStrictEqual(staff.unlockDoors, ["Headmaster", "SecretPassage"]);
    const auror = evaluateRules(rules, [{ key: "job:auror", grade: 0 }]);
    assert.strictEqual(auror.superAlohomora, true);
    assert.throws(() => normalizeRule({ priority: 1, action: "allow", doors: "*", locks: ["x"] }, 0), /exactly one/);

    const player = { id: 7, nickname: "Test", emitted: [] as Array<{ name: string; payload: unknown }>, emit(name: string, payload?: unknown) { this.emitted.push({ name, payload }); } };
    const metadata = new Map<string, unknown>();
    const core = {
        characters: { active: () => ({ id: 42, accountId: 1, slot: 1, name: "Test", status: "active", createdAt: "", updatedAt: "", deletedAt: null }) },
        groups: { effective: async () => [{ scope: "character", key: "staff", grade: 2, metadata: {} }] },
        metadata: {
            getCharacter: async (_id: number, key: string) => metadata.get(key),
            setCharacter: async (_id: number, key: string, value: unknown) => { metadata.set(key, value); return value; },
        },
    };
    const service = createDoorService({ core: core as never, config: { command: "doors", enableCommands: true, adminGroups: [], rules }, players: () => [player] });
    assert.strictEqual(await service.grants.grant(player, "SecretPassage"), true);
    assert.deepStrictEqual(metadata.get(METADATA_KEY), ["SecretPassage"]);
    assert.deepStrictEqual(await service.grants.list(player), ["SecretPassage"]);
    assert.strictEqual(await service.grants.revoke(player, "SecretPassage"), true);
    assert.deepStrictEqual(await service.grants.list(player), []);
    assert.ok(player.emitted.some((event) => event.name === "hmp-doors:policy"));

    const lockCalls: Array<[string, boolean | undefined]> = [];
    const superCalls: boolean[] = [];
    const physical: unknown[] = [];
    const events: Array<{ name: string; payload: unknown }> = [];
    const client = createDoorClient({
        events: { emitServer: (name, payload) => events.push({ name, payload }) },
        doors: {
            setLock: (id, unlocked) => { lockCalls.push([id, unlocked]); return true; },
            superAlohomora: (enabled = true) => { superCalls.push(enabled); return true; },
            setPolicy: (value) => { physical.push(value); },
            list: () => [], openNearby: () => 0, unlockNearby: () => 0, setOpen: () => true,
        },
    });
    assert.deepStrictEqual(events.map((event) => event.name), ["hmp-doors:ready"]);
    client.apply({ unlockLocks: ["GateLock"], superAlohomora: true, unlockAll: true });
    client.apply({ unlockLocks: [], superAlohomora: false, unlockAll: false });
    assert.deepStrictEqual(lockCalls, [["GateLock", true], ["GateLock", false]]);
    assert.deepStrictEqual(superCalls, [true, false]);
    assert.strictEqual(physical.length, 2);
    client.stop();
    assert.strictEqual(client.status().stopped, true);
}

run().then(() => console.log("hmp-doors tests passed"));
