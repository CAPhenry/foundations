import catalogModule = require("../shared/catalog");
import configModule = require("./config");
import policyModule = require("./policy");
import type { HmpSpellEntitlements, HmpSpellPlayer, HmpSpellRule } from "../types";
import type { SpellDependencies, SpellService } from "./internal";

const { catalog, resolveSpell } = catalogModule;
const { normalizeRule } = configModule;
const { evaluateRules } = policyModule;
const METADATA_KEY = "hmp-spells:entitlements";

function sanitizeEntitlements(raw: unknown): HmpSpellEntitlements {
    const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const spells = Array.isArray(value.spells)
        ? [...new Set(value.spells.map((spell) => resolveSpell(String(spell))).filter((spell): spell is string => !!spell))].sort()
        : [];
    const rawLoadouts = value.bonusLoadouts;
    const bonusLoadouts = Number.isSafeInteger(Number(rawLoadouts)) && Number(rawLoadouts) >= 0 && Number(rawLoadouts) <= 3
        ? Number(rawLoadouts) : null;
    return { spells, bonusLoadouts };
}

function createSpellService<P extends HmpSpellPlayer>(dependencies: SpellDependencies<P>): SpellService<P> {
    const { core, config } = dependencies;
    const now = dependencies.now || Date.now;
    const startedAt = now();
    const synced = new Set<number>();
    const runtimeRules = new Map<string, HmpSpellRule>();
    let stopped = false;

    const ruleKey = (resource: string, id: string) => `${resource}:${id}`;
    const allRules = () => [...config.rules, ...runtimeRules.values()];
    const activeCharacter = (player: P) => core.characters.active(player);

    async function read(player: P): Promise<HmpSpellEntitlements> {
        const character = activeCharacter(player);
        if (!character) return { spells: [], bonusLoadouts: null };
        return sanitizeEntitlements(await core.metadata.getCharacter(character.id, METADATA_KEY));
    }

    async function write(player: P, value: HmpSpellEntitlements): Promise<void> {
        const character = activeCharacter(player);
        if (!character) throw new Error("No character is active");
        await core.metadata.setCharacter(character.id, METADATA_KEY, { version: 1, spells: [...value.spells].sort(), ...(value.bonusLoadouts === null ? {} : { bonusLoadouts: value.bonusLoadouts }) });
    }

    async function resolve(player: P) {
        if (stopped) throw new Error("hmp-spells is stopped");
        const [groups, entitlements] = await Promise.all([core.groups.effective(player), read(player)]);
        return { player, character: activeCharacter(player), groups, entitlements, policy: evaluateRules(allRules(), groups, entitlements) };
    }

    async function sync(player: P) {
        const resolution = await resolve(player);
        player.emit("hmp-spells:policy", JSON.stringify(resolution.policy));
        synced.add(Number(player.id));
        return resolution.policy;
    }

    async function syncAll(): Promise<number> {
        const players = dependencies.players();
        await Promise.all(players.map(sync));
        return players.length;
    }

    function contextPayload(player: P, spell: string | null, context: { resource?: string; actor?: P; reason?: string } = {}) {
        return { player, character: activeCharacter(player), spell, resource: context.resource || "unknown", actor: context.actor || null, reason: String(context.reason || "").slice(0, 500) };
    }

    async function grant(player: P, rawSpell: string, context = {}): Promise<boolean> {
        const spell = resolveSpell(rawSpell);
        if (!spell) throw new TypeError(`Unknown spell '${rawSpell}'`);
        const value = await read(player);
        if (value.spells.includes(spell)) return false;
        value.spells.push(spell);
        await write(player, value);
        await sync(player);
        dependencies.emit?.("hmp:spells:granted", contextPayload(player, spell, context));
        return true;
    }

    async function revoke(player: P, rawSpell: string, context = {}): Promise<boolean> {
        const spell = resolveSpell(rawSpell);
        if (!spell) throw new TypeError(`Unknown spell '${rawSpell}'`);
        const value = await read(player);
        if (!value.spells.includes(spell)) return false;
        value.spells = value.spells.filter((entry) => entry !== spell);
        await write(player, value);
        await sync(player);
        dependencies.emit?.("hmp:spells:revoked", contextPayload(player, spell, context));
        return true;
    }

    async function clear(player: P, context = {}): Promise<number> {
        const value = await read(player);
        if (!value.spells.length) return 0;
        const count = value.spells.length;
        value.spells = [];
        await write(player, value);
        await sync(player);
        dependencies.emit?.("hmp:spells:cleared", { ...contextPayload(player, null, context), count });
        return count;
    }

    async function setLoadouts(player: P, rawCount: number, context = {}): Promise<boolean> {
        const count = Number(rawCount);
        if (!Number.isSafeInteger(count) || count < 0 || count > 3) throw new TypeError("bonusLoadouts must be an integer from 0 to 3");
        const value = await read(player);
        if (value.bonusLoadouts === count) return false;
        value.bonusLoadouts = count;
        await write(player, value);
        await sync(player);
        dependencies.emit?.("hmp:spells:loadouts", { ...contextPayload(player, null, context), bonusLoadouts: count, managed: true });
        return true;
    }

    async function unmanageLoadouts(player: P, context = {}): Promise<boolean> {
        const value = await read(player);
        if (value.bonusLoadouts === null) return false;
        value.bonusLoadouts = null;
        await write(player, value);
        await sync(player);
        dependencies.emit?.("hmp:spells:loadouts", { ...contextPayload(player, null, context), bonusLoadouts: null, managed: false });
        return true;
    }

    function unregister(id: string, resource: string): boolean {
        const removed = runtimeRules.delete(ruleKey(String(resource), String(id)));
        if (removed && !stopped) void syncAll();
        return removed;
    }

    function register(rawRule: HmpSpellRule): () => boolean {
        if (stopped) throw new Error("hmp-spells is stopped");
        const rule = normalizeRule(rawRule, runtimeRules.size, rawRule.resource);
        const key = ruleKey(rule.resource, rule.id);
        if (runtimeRules.has(key)) throw new Error(`Spell rule '${rule.id}' is already registered by '${rule.resource}'`);
        runtimeRules.set(key, rule);
        void syncAll();
        let active = true;
        return () => {
            if (!active) return false;
            active = false;
            return unregister(rule.id, rule.resource);
        };
    }

    function clearRules(resource: string): number {
        let count = 0;
        for (const [key, rule] of runtimeRules) if (rule.resource === resource) { runtimeRules.delete(key); count++; }
        if (count && !stopped) void syncAll();
        return count;
    }

    return Object.freeze({
        catalog,
        policy: Object.freeze({ resolve, sync, syncAll }),
        rules: Object.freeze({
            register, unregister, clear: clearRules,
            list: (resource?: string) => [...runtimeRules.values()].filter((rule) => !resource || rule.resource === resource).map((rule) => ({ ...rule })),
            refresh: syncAll,
        }),
        grants: Object.freeze({ list: async (player: P) => (await read(player)).spells, grant, revoke, clear }),
        loadouts: Object.freeze({ get: async (player: P) => (await read(player)).bonusLoadouts, set: setLoadouts, unmanage: unmanageLoadouts }),
        status: () => ({ state: stopped ? "stopped" as const : "ready" as const, catalogSize: catalog.list().length, configuredRules: config.rules.length, runtimeRules: runtimeRules.size, syncedPlayers: synced.size, uptimeMs: now() - startedAt }),
        stop: () => { stopped = true; synced.clear(); runtimeRules.clear(); },
    });
}

export = { createSpellService, sanitizeEntitlements, METADATA_KEY };
