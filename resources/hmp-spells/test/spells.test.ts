import assert = require("node:assert");
import catalogModule = require("../shared/catalog");
import configModule = require("../server/config");
import policyModule = require("../server/policy");
import serviceModule = require("../server/service");
import clientModule = require("../client/service");
import type { HmpSpellRule } from "../types";

const { catalog } = catalogModule;
const { normalizeRule } = configModule;
const { evaluateRules } = policyModule;
const { createSpellService, METADATA_KEY } = serviceModule;
const { createSpellClient } = clientModule;

async function run(): Promise<void> {
    assert.strictEqual(catalog.resolve("incendio"), "Spell_Incendio");
    assert.strictEqual(catalog.resolve("Bombarda"), "Spell_Expulso");
    assert.strictEqual(catalog.resolve("Spell_Custom_Test"), "Spell_Custom_Test");
    assert.strictEqual(catalog.resolve("not-a-spell"), null);
    assert.ok(catalog.list("lev").some((spell) => spell.name === "Levioso"));

    const rules: HmpSpellRule[] = [
        normalizeRule({ id: "starter", resource: "test", priority: 1000, action: "allow", spells: ["Lumos", "Accio"], bonusLoadouts: 1 }, 0),
        normalizeRule({ id: "restricted", resource: "test", priority: 500, action: "deny", spells: ["Accio"] }, 1),
        normalizeRule({ id: "auror", resource: "test", priority: 100, action: "allow", spells: ["Accio", "Stupefy"], match: { groups: [{ key: "job:auror", minimumGrade: 2 }] } }, 2),
    ];
    const guest = evaluateRules(rules, [], { spells: [], bonusLoadouts: null });
    assert.deepStrictEqual(guest, { unlockSpells: ["Spell_Lumos"], bonusLoadouts: 1 });
    const auror = evaluateRules(rules, [{ key: "job:auror", grade: 2 }], { spells: ["Spell_Incendio"], bonusLoadouts: 2 });
    assert.deepStrictEqual(auror, { unlockSpells: ["Spell_Accio", "Spell_Incendio", "Spell_Lumos", "Spell_Stupefy"], bonusLoadouts: 2 });
    assert.throws(() => normalizeRule({ id: "bad", resource: "x", priority: 1, action: "allow", spells: ["Typo"] }, 0), /unknown spell/);
    assert.throws(() => normalizeRule({ id: "bad", resource: "x", priority: 1, action: "deny", bonusLoadouts: 1 }, 0), /only valid on allow/);

    const player = { id: 7, nickname: "Test", emitted: [] as Array<{ name: string; payload: unknown }>, emit(name: string, payload?: unknown) { this.emitted.push({ name, payload }); } };
    const metadata = new Map<string, unknown>();
    const emitted: Array<{ name: string; args: unknown[] }> = [];
    const core = {
        characters: { active: () => ({ id: 42, accountId: 1, slot: 1, name: "Test", status: "active", createdAt: "", updatedAt: "", deletedAt: null }) },
        groups: { effective: async () => [{ scope: "character", key: "job:auror", grade: 2, metadata: {} }] },
        metadata: {
            getCharacter: async (_id: number, key: string) => metadata.get(key),
            setCharacter: async (_id: number, key: string, value: unknown) => { metadata.set(key, value); return value; },
        },
    };
    const service = createSpellService({
        core: core as never,
        config: { command: "spells", enableCommands: true, adminGroups: [], rules, maxCastReportsPerSecond: 12 },
        players: () => [player], emit: (name, ...args) => emitted.push({ name, args }),
    });
    assert.strictEqual(await service.grants.grant(player, "Incendio", { resource: "test" }), true);
    assert.deepStrictEqual(await service.grants.list(player), ["Spell_Incendio"]);
    assert.deepStrictEqual(metadata.get(METADATA_KEY), { version: 1, spells: ["Spell_Incendio"] });
    assert.strictEqual(await service.loadouts.set(player, 3, { resource: "test" }), true);
    assert.strictEqual(await service.loadouts.get(player), 3);
    assert.strictEqual(await service.loadouts.unmanage(player), true);
    assert.strictEqual(await service.loadouts.get(player), null);
    assert.strictEqual(await service.grants.revoke(player, "Incendio"), true);
    assert.ok(emitted.some((event) => event.name === "hmp:spells:granted"));
    assert.ok(emitted.some((event) => event.name === "hmp:spells:revoked"));
    const dispose = service.rules.register({ id: "runtime", resource: "hmp-dueling", priority: 50, action: "allow", spells: ["Crucio"] });
    await service.rules.refresh();
    assert.ok((await service.policy.resolve(player)).policy.unlockSpells.includes("Spell_Crucio"));
    assert.strictEqual(dispose(), true);
    assert.strictEqual(service.rules.list().length, 0);
    assert.ok(player.emitted.some((event) => event.name === "hmp-spells:policy"));

    const policies: Array<{ ids: string[]; loadouts: number | undefined }> = [];
    const serverEvents: Array<{ name: string; payload: unknown }> = [];
    const nativeLoadout = { index: 0, current: 0, slots: ["Lumos", null, null, null] };
    const client = createSpellClient({
        events: { emitServer: (name, payload) => serverEvents.push({ name, payload }) },
        spells: {
            setPolicy: (ids, loadouts) => policies.push({ ids, loadouts }),
            loadout: () => nativeLoadout,
            setLoadoutSlot: () => true,
            cast: (slot) => ({ accepted: true, slot, spellName: "Lumos", reason: null }),
        },
    });
    assert.deepStrictEqual(serverEvents.map((event) => event.name), ["hmp-spells:ready"]);
    client.apply({ unlockSpells: ["Spell_Lumos", "invalid"], bonusLoadouts: 2 });
    assert.deepStrictEqual(policies[0], { ids: ["Spell_Lumos"], loadouts: 2 });
    assert.strictEqual(client.loadout()?.slots[0], "Lumos");
    assert.strictEqual(client.cast(0).accepted, true);
    client.reportCast("/Game/Spells/Lumos/DA_LumosSpellRecord.DA_LumosSpellRecord");
    assert.strictEqual(JSON.parse(String(serverEvents.at(-1)?.payload)).name, "Lumos");
    client.stop();
    assert.deepStrictEqual(policies.at(-1), { ids: [], loadouts: -1 });
}

run().then(() => console.log("hmp-spells tests passed"));
