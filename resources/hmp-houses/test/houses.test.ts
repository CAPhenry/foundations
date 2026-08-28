import assert = require("node:assert");
import normalizeModule = require("../shared/normalize");
import repositoryModule = require("../server/repository");
import serviceModule = require("../server/service");
import type { HmpHouseId, HmpHouseMembership, HmpHouseMembershipAudit, HmpHousePointTransaction, HmpHouseStanding } from "../types";
import type { HousesRepository, Player, PointDraft } from "../server/internal";

const { house, nativeHouse } = normalizeModule;
const { mapStanding, mapPoint } = repositoryModule;
const { createHousesService } = serviceModule;

function now(): Date { return new Date("2026-08-28T12:00:00Z"); }

async function run(): Promise<void> {
    assert.strictEqual(house("GRYFFINDOR"), "gryffindor");
    assert.strictEqual(nativeHouse("hufflepuff"), "Hufflepuff");
    assert.strictEqual(nativeHouse(null), "Unaffiliated");
    assert.throws(() => house("durmstrang"), /must be one of/);
    assert.deepStrictEqual(mapStanding({ house_id: "ravenclaw", points: "25", updated_at: now() }), { house: "ravenclaw", points: 25, updatedAt: now() });
    assert.strictEqual(mapPoint({ id: "1", reference_id: "test:1", house_id: "slytherin", amount: "-5", balance_after: "10", actor_character_id: null, source_resource: "test", reason_text: "dock", metadata_json: "{\"round\":1}", status: "completed", error_text: "", created_at: now(), completed_at: now() }).amount, -5);

    const memberships = new Map<number, HmpHouseMembership>();
    const membershipAudit: HmpHouseMembershipAudit[] = [];
    const standings = new Map<HmpHouseId, number>([["gryffindor", 0], ["hufflepuff", 0], ["ravenclaw", 0], ["slytherin", 0]]);
    const transactions = new Map<string, HmpHousePointTransaction>();
    let transactionId = 0;
    const repository: HousesRepository = {
        migrate: async () => undefined,
        membership: async (characterId) => memberships.get(characterId) || null,
        setMembership: async (mutation) => {
            const existing = memberships.get(mutation.characterId);
            if (existing?.house === mutation.house) return { membership: existing, previousHouse: existing.house };
            const value: HmpHouseMembership = { characterId: mutation.characterId, characterName: "Tester", house: mutation.house, assignedByCharacterId: mutation.actorCharacterId, resource: mutation.resource, reason: mutation.reason, createdAt: existing?.createdAt || now(), updatedAt: now() };
            memberships.set(mutation.characterId, value);
            membershipAudit.push({ id: membershipAudit.length + 1, characterId: mutation.characterId, fromHouse: existing?.house || null, toHouse: mutation.house, actorCharacterId: mutation.actorCharacterId, resource: mutation.resource, reason: mutation.reason, createdAt: now() });
            return { membership: value, previousHouse: existing?.house || null };
        },
        clearMembership: async (characterId, actorCharacterId, resource, reason) => {
            const existing = memberships.get(characterId);
            if (!existing) return null;
            memberships.delete(characterId);
            membershipAudit.push({ id: membershipAudit.length + 1, characterId, fromHouse: existing.house, toHouse: null, actorCharacterId, resource, reason, createdAt: now() });
            return existing.house;
        },
        members: async (house, count) => [...memberships.values()].filter((entry) => entry.house === house).slice(0, count),
        membershipHistory: async (characterId, count) => membershipAudit.filter((entry) => entry.characterId === characterId).slice(-count).reverse(),
        standing: async (house) => ({ house, points: standings.get(house)!, updatedAt: now() }),
        standings: async () => [...standings].map(([house, points]) => ({ house, points, updatedAt: now() })),
        pointTransaction: async (reference) => transactions.get(reference) || null,
        beginPoint: async (draft: PointDraft) => {
            const existing = transactions.get(draft.reference);
            if (existing) return { created: false, transaction: existing };
            const transaction: HmpHousePointTransaction = { id: ++transactionId, reference: draft.reference, house: draft.house, amount: draft.amount, balanceAfter: null, actorCharacterId: draft.actorCharacterId, resource: draft.resource, reason: draft.reason, metadata: draft.metadata, status: "pending", error: "", createdAt: now(), completedAt: null };
            transactions.set(draft.reference, transaction);
            return { created: true, transaction };
        },
        applyPoint: async (reference, allowNegative) => {
            const existing = transactions.get(reference)!;
            if (existing.status === "completed") return existing;
            const balance = standings.get(existing.house)! + existing.amount;
            if (!allowNegative && balance < 0) throw new Error("negative");
            standings.set(existing.house, balance);
            const completed = { ...existing, status: "completed" as const, balanceAfter: balance, completedAt: now() };
            transactions.set(reference, completed);
            return completed;
        },
        failPoint: async (reference, error) => {
            const existing = transactions.get(reference)!;
            const failed = { ...existing, status: "failed" as const, error, completedAt: now() };
            transactions.set(reference, failed);
            return failed;
        },
        pointHistory: async (house, count) => [...transactions.values()].filter((entry) => !house || entry.house === house).slice(-count).reverse(),
        pendingPoints: async (count) => [...transactions.values()].filter((entry) => entry.status === "pending").slice(0, count),
    };

    const player = { id: 7, nickname: "Tester", house: "Unaffiliated" as const } as Player;
    const character = { id: 42, accountId: 1, slot: 1, name: "Tester", status: "active", createdAt: now(), updatedAt: now(), deletedAt: null };
    const groups = new Map<string, { scope: "character"; key: string; grade: number; metadata: Record<string, unknown> }>();
    const emitted: Array<{ name: string; payload: unknown }> = [];
    const core = {
        characters: { active: () => character },
        sessions: { all: () => [{ player, playerId: 7, account: {}, principal: {}, character, connectedAt: "" }] },
        groups: {
            listCharacter: async () => [...groups.values()],
            setCharacter: async (_id: number, key: string, grade: number, metadata: Record<string, unknown>) => { const value = { scope: "character" as const, key, grade, metadata }; groups.set(key, value); return value; },
            removeCharacter: async (_id: number, key: string) => groups.delete(key),
        },
    };
    const service = createHousesService({
        repository, core: core as never, events: { emit: (name, payload) => { emitted.push({ name, payload }); } },
        logger: { info: () => true, warn: () => true, error: () => true },
        config: { enableCommands: true, houseCommand: "house", pointsCommand: "points", adminGroups: [], groupPrefix: "house:", allowNegativePoints: true },
        migrations: [], now: () => now().getTime(),
    });
    await service.start();
    await service.membership.set(player, "gryffindor", { resource: "hmp-sorting", actor: player, reason: "sorted" });
    assert.strictEqual(player.house, "Gryffindor");
    assert.ok(groups.has("house:gryffindor"));
    await service.membership.set(player, "slytherin", { resource: "hmp-admin", actor: player });
    assert.strictEqual(groups.has("house:gryffindor"), false);
    assert.ok(groups.has("house:slytherin"));
    assert.strictEqual((await service.membership.history(42)).length, 2);
    assert.strictEqual(await service.membership.clear(player, { resource: "hmp-admin", actor: player }), true);
    assert.strictEqual(player.house, "Unaffiliated");
    assert.strictEqual(groups.size, 0);

    const options = { reference: "quidditch:match-1:winner", resource: "hmp-quidditch", actor: player, metadata: { matchId: 1 } };
    const awarded = await service.points.award("gryffindor", 50, options);
    assert.strictEqual(awarded.balanceAfter, 50);
    assert.strictEqual((await service.points.award("gryffindor", 50, options)).balanceAfter, 50);
    await service.points.deduct("gryffindor", 10, { ...options, reference: "duels:penalty-1", resource: "hmp-duels" });
    assert.strictEqual((await service.points.get("gryffindor")).points, 40);
    await assert.rejects(() => service.points.award("slytherin", 50, options), /reused for a different operation/);
    assert.strictEqual(emitted.filter((event) => event.name === "hmp:houses:points").length, 2);
    assert.strictEqual(emitted.filter((event) => event.name === "hmp:houses:changed").length, 3);
    assert.strictEqual(service.status().state, "ready");
}

run().then(() => console.log("hmp-houses tests passed"));
