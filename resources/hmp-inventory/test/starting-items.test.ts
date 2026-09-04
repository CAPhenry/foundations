import assert = require("node:assert");
import { test } from "node:test";
import configModule = require("../server/config");
import startingItemsModule = require("../server/starting-items");
import type { CharacterPayload, InventoryService, Logger, Player } from "../server/internal";

const { normalizeStartingItems } = configModule;
const { createStartingItemsGrant } = startingItemsModule;

const silentLogger: Logger = { info: () => true, warn: () => true, error: () => true };

function fakeInventory(): { service: InventoryService; added: Array<{ player: number; name: string; amount: number; options: unknown }>; fail: Set<string> } {
    const added: Array<{ player: number; name: string; amount: number; options: unknown }> = [];
    const fail = new Set<string>();
    const service = {
        api: {
            async add(target: Player | number, name: string, amount = 1, options: unknown = {}) {
                if (fail.has(name)) throw Object.assign(new Error(`Unknown item '${name}'`), { code: "HMP_INVENTORY_ITEM_UNKNOWN" });
                added.push({ player: typeof target === "object" ? target.id : Number(target), name, amount, options });
                return amount;
            },
        },
    } as unknown as InventoryService;
    return { service, added, fail };
}

function payload(characterId: number): CharacterPayload {
    const player = { id: 7, nickname: "Poppy", position: { x: 0, y: 0, z: 0 }, emit() {}, teleport: () => 0 } as unknown as Player;
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
    } as unknown as CharacterPayload;
}

test("normalizes bare names, aliases, counts and metadata; drops junk", () => {
    assert.deepStrictEqual(normalizeStartingItems(undefined), []);
    assert.deepStrictEqual(normalizeStartingItems([]), []);
    assert.deepStrictEqual(
        normalizeStartingItems([
            "HouseBroom",
            { name: "sealed_letter", amount: 3 },
            { item: "native:wiggenweld_potion", count: "5" },
            { name: "evidence_bag", metadata: { issued: true } },
            { name: "  ", amount: 2 },
            { amount: 9 },
            42,
            null,
        ]),
        [
            { name: "housebroom", amount: 1 },
            { name: "sealed_letter", amount: 3 },
            { name: "native:wiggenweld_potion", amount: 5 },
            { name: "evidence_bag", amount: 1, metadata: { issued: true } },
        ],
    );
});

test("startingItems must be an array", () => {
    assert.throws(() => normalizeStartingItems({ name: "x" }), /startingItems must be an array/);
});

test("grants only a newly-created character, once, after its inventory is loaded", async () => {
    const { service, added } = fakeInventory();
    const grant = createStartingItemsGrant(
        normalizeStartingItems(["housebroom", { name: "sealed_letter", amount: 2, metadata: { sealed: true } }]),
        { inventory: service, ready: () => Promise.resolve(), logger: silentLogger },
    );
    const created = payload(12);

    assert.strictEqual(await grant.loaded(created), false); // not created yet -> ignored
    assert.strictEqual(grant.created(created), true);
    assert.strictEqual(await grant.loaded(payload(13)), false); // a different, pre-existing character
    assert.strictEqual(await grant.loaded(created), true);
    assert.strictEqual(grant.pending(12), false);
    assert.strictEqual(await grant.loaded(created), false); // no double grant

    assert.deepStrictEqual(added, [
        { player: 7, name: "housebroom", amount: 1, options: {} },
        { player: 7, name: "sealed_letter", amount: 2, options: { metadata: { sealed: true } } },
    ]);
});

test("an unknown item is logged and skipped without blocking the rest of the grant", async () => {
    const { service, added, fail } = fakeInventory();
    fail.add("mystery_item");
    const warnings: string[] = [];
    const grant = createStartingItemsGrant(
        normalizeStartingItems(["mystery_item", "sealed_letter"]),
        { inventory: service, ready: () => Promise.resolve(), logger: { ...silentLogger, warn: (message: unknown) => { warnings.push(String(message)); return true; } } },
    );
    const created = payload(12);
    grant.created(created);
    assert.strictEqual(await grant.loaded(created), true);
    assert.deepStrictEqual(added.map((row) => row.name), ["sealed_letter"]);
    assert.strictEqual(grant.pending(12), false);
    assert.match(warnings[0], /mystery_item/);
});

test("a failed readiness check keeps the grant pending for a later load", async () => {
    const { service, added } = fakeInventory();
    let ready = false;
    const grant = createStartingItemsGrant(
        normalizeStartingItems(["sealed_letter"]),
        { inventory: service, ready: () => ready ? Promise.resolve() : Promise.reject(new Error("hmp-mysql is not ready")), logger: silentLogger },
    );
    const created = payload(12);
    grant.created(created);
    await assert.rejects(() => grant.loaded(created), /not ready/);
    assert.strictEqual(grant.pending(12), true);
    assert.strictEqual(added.length, 0);

    ready = true;
    assert.strictEqual(await grant.loaded(created), true);
    assert.deepStrictEqual(added.map((row) => row.name), ["sealed_letter"]);
});

test("a deleted character drops its pending grant", () => {
    const { service } = fakeInventory();
    const grant = createStartingItemsGrant(normalizeStartingItems(["sealed_letter"]), { inventory: service, ready: () => Promise.resolve(), logger: silentLogger });
    const created = payload(12);
    grant.created(created);
    assert.strictEqual(grant.pending(12), true);
    assert.strictEqual(grant.deleted(created), true);
    assert.strictEqual(grant.pending(12), false);
});
