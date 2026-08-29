import assert = require("node:assert");
import normalizeModule = require("../shared/normalize");
import serviceModule = require("../server/service");
import type { HmpEmoteAliasRecord } from "../types";

const { normalizeDefinition, normalizeConfigured } = normalizeModule;
const { createEmoteService, FAVORITES_KEY, favoritePath, suggestedAlias } = serviceModule;

async function run(): Promise<void> {
    assert.deepStrictEqual(normalizeConfigured("Wave", { path: "/Game/Wave.Wave", kind: "ability", channel: "PartialBody" }), {
        name: "wave", path: "/Game/Wave.Wave", kind: "ability", channel: "PartialBody",
    });
    assert.throws(() => normalizeDefinition({ name: "bad name", path: "/Game/X.X" }), /emote name/);
    assert.throws(() => normalizeDefinition({ name: "wave", path: "X" }), /object path/);
    assert.strictEqual(favoritePath("Animation/Human/Wave"), "Animation/Human/Wave");
    assert.strictEqual(suggestedAlias("/Game/Pawn/Student/Abilities/PartialBody/Waving/ABL_Waving.ABL_Waving_C"), "waving");

    const writes: unknown[] = [];
    const rows: HmpEmoteAliasRecord[] = [{
        name: "apple", path: "", kind: "pose", channel: "FullBody", source: "database", hidden: true,
    }];
    const repository = {
        start: async () => {},
        list: async () => rows,
        put: async (record: unknown) => { writes.push(record); },
    };
    const metadata = new Map<string, unknown>();
    const emitted: Array<{ name: string; payload: unknown }> = [];
    const player = { id: 7, nickname: "Editor", emit(name: string, payload?: unknown) { emitted.push({ name, payload }); }, sendChat() {} };
    const core = {
        accounts: { getByPlayer: () => ({ id: 11, displayName: "Editor", createdAt: "", lastSeenAt: "" }) },
        groups: { has: async (_player: unknown, key: string) => key === "admin" },
        metadata: {
            getAccount: async (_id: number, key: string) => metadata.get(key),
            setAccount: async (_id: number, key: string, value: unknown) => { metadata.set(key, value); return value; },
        },
    };
    const config = {
        command: "emote", enabled: true, allowAll: false, maxFavorites: 2, maxAliases: 10,
        editorGroups: [{ key: "admin", minimumGrade: 1 }], ui: { url: "http://resources/hmp-emotes/dist/menu.html" },
        aliases: {
            apple: "/Game/Apple.Apple",
            popcorn: "/Game/Popcorn.Popcorn",
        },
    };
    const service = createEmoteService({
        database: {} as never, repository: repository as never, core: core as never, config,
        migrations: [], players: () => [player], events: { emit() {} }, now: () => 100,
    });
    await service.ready();
    assert.strictEqual(service.emotes.get("apple"), null, "database tombstone should hide config alias");
    assert.strictEqual(service.emotes.get("popcorn")?.path, "/Game/Popcorn.Popcorn");

    const unregister = service.aliases.register({ name: "sit", path: "/Game/Sit.Sit", kind: "pose", channel: "FullBody", resource: "test-resource" });
    assert.strictEqual(service.emotes.get("sit")?.resource, "test-resource");
    assert.strictEqual(unregister(), true);
    assert.strictEqual(service.emotes.get("sit"), null);

    await service.aliases.set(player, { name: "wave", path: "/Game/Wave.Wave_C", kind: "ability", channel: "PartialBody" });
    assert.strictEqual(service.emotes.get("wave")?.kind, "ability");
    assert.strictEqual(writes.length, 1);
    assert.strictEqual(await service.aliases.clearPath(player, "/Game/Wave.Wave_C"), 1);
    assert.strictEqual(service.emotes.get("wave"), null);

    const allowed = await service.aliases.allow(player, {
        path: "/Game/Pawn/Student/Abilities/PartialBody/Waving/ABL_Waving.ABL_Waving_C",
        kind: "ability",
        channel: "PartialBody",
    });
    assert.strictEqual(allowed.name, "waving");
    assert.strictEqual(service.emotes.get("waving")?.path, allowed.path);
    assert.strictEqual(await service.aliases.deny(player, allowed.path), 1);
    assert.strictEqual(service.emotes.get("waving"), null);

    assert.deepStrictEqual(await service.favorites.toggle(player, "Animation/Human/Wave"), ["Animation/Human/Wave"]);
    assert.deepStrictEqual(metadata.get(FAVORITES_KEY), ["Animation/Human/Wave"]);
    assert.deepStrictEqual(await service.favorites.toggle(player, "Animation/Human/Wave"), []);

    assert.strictEqual(await service.emotes.play(player, "popcorn"), true);
    assert.ok(emitted.some((event) => event.name === "hmp-emotes:play"));
    await service.onClientReady(player);
    assert.ok(emitted.some((event) => event.name === "hmp-emotes:configure"));
    assert.strictEqual(service.status().state, "ready");
    service.stop();
    assert.strictEqual(service.status().state, "stopped");
}

run().then(() => console.log("hmp-emotes tests passed"));
