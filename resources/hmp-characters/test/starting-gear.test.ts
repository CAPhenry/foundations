import assert = require("node:assert");
import { test } from "node:test";
import configModule = require("../server/config");
import startingGearModule = require("../server/starting-gear");
import type { CharacterEventPayload, Player } from "../server/internal";

const { DEFAULT_STARTING_GEAR, normalizeStartingGear } = configModule;
const { createStartingGearGrant } = startingGearModule;

function payload(characterId: number, calls: Array<{ operations: HogwartsMpInventoryPatchOperation[] }>): CharacterEventPayload {
    const player = {
        id: 7,
        nickname: "Poppy",
        position: { x: 0, y: 0, z: 0 },
        emit() {},
        teleport: () => 0,
        inventory: {
            revision: 0,
            list: () => [],
            count: () => 0,
            has: () => false,
            clear() {},
            native: () => null,
            waitForRevision: async (revision: number) => ({ items: [], sequence: 1, appliedRevision: revision, applyErrors: [] }),
            persist() {},
            replace() {},
            give() {},
            remove() {},
            patch(operations: HogwartsMpInventoryPatchOperation[], _options?: HogwartsMpInventoryPatchOptions, callback?: HogwartsMpNativeInventoryCallback) {
                calls.push({ operations });
                callback?.(null, { revision: 4, rows: operations.length });
            },
            move() {},
            adoptNative() {},
            use: () => 0,
        },
    } as Player;
    return {
        session: {
            player,
            playerId: player.id,
            account: { id: 10, displayName: "Poppy", createdAt: "now", lastSeenAt: "now" },
            principal: { provider: "test", subject: "poppy", trust: "verified" },
            character: null,
            connectedAt: "now",
        },
        character: { id: characterId, accountId: 10, slot: 1, name: "Poppy", status: "active", createdAt: "now", updatedAt: "now", deletedAt: null },
    };
}

test("defaults to the four vanilla WEK_01 gear grants", () => {
    assert.deepStrictEqual(normalizeStartingGear(undefined), DEFAULT_STARTING_GEAR);
    assert.deepStrictEqual(normalizeStartingGear([]), []);
});

test("grants only a newly-created character after its inventory is loaded", async () => {
    const calls: Array<{ operations: HogwartsMpInventoryPatchOperation[] }> = [];
    const grant = createStartingGearGrant(normalizeStartingGear(undefined));
    const created = payload(12, calls);
    assert.strictEqual(await grant.loaded(created), false);
    assert.strictEqual(grant.created(created), true);
    assert.strictEqual(await grant.loaded(payload(13, calls)), false);
    assert.strictEqual(await grant.loaded(created), true);
    assert.strictEqual(grant.pending(12), false);
    assert.deepStrictEqual(calls[0].operations, DEFAULT_STARTING_GEAR.map((entry) => ({ ...entry, op: "give" })));
});

test("keeps a failed grant pending for a later character load", async () => {
    const calls: Array<{ operations: HogwartsMpInventoryPatchOperation[] }> = [];
    const value = payload(12, calls);
    value.session.player.inventory!.waitForRevision = async () => { throw Object.assign(new Error("wrong holder"), { code: "NATIVE_APPLY_FAILED" }); };
    const grant = createStartingGearGrant(normalizeStartingGear(undefined));
    grant.created(value);
    await assert.rejects(() => grant.loaded(value), /wrong holder/);
    assert.strictEqual(grant.pending(12), true);
});
