import type { HmpPvp, HmpPvpDecision, HmpPvpHit, HmpPvpRule, HmpPvpRuleInfo } from "../types";

interface Dependencies {
    defaultDecision: "allow" | "deny";
    initialLethalMode: boolean;
    install(policy: (hit: HmpPvpHit) => HmpPvpDecision): void;
    clearPolicy(): void;
    vitals(playerId: number): { hp: number; max: number; level: number; ageMs: number } | null;
    applyMode(enabled: boolean, playerId?: number): void;
    modeChanged?(enabled: boolean, context: { resource: string; actor?: unknown; reason: string }): void;
    warn?(message: string): void;
    now?: () => number;
}

function clean(value: unknown, label: string): string {
    const result = String(value || "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9:_-]{0,99}$/.test(result)) throw new TypeError(`${label} is invalid`);
    return result;
}

function createPvpService(dependencies: Dependencies): HmpPvp & { cleanup(resource: string): number; stop(): void } {
    const now = dependencies.now || Date.now;
    const startedAt = now();
    const rules = new Map<string, HmpPvpRule>();
    let state: "ready" | "stopped" = "ready";
    let lethalMode = dependencies.initialLethalMode;
    let evaluated = 0, allowed = 0, denied = 0, errors = 0;
    const key = (resource: string, id: string) => `${resource}:${id}`;
    const info = (rule: HmpPvpRule): HmpPvpRuleInfo => ({ id: rule.id, resource: rule.resource, priority: rule.priority });
    const ordered = () => [...rules.values()].sort((left, right) => right.priority - left.priority || left.resource.localeCompare(right.resource) || left.id.localeCompare(right.id));

    function evaluate(hit: HmpPvpHit): HmpPvpDecision {
        evaluated++;
        for (const rule of ordered()) {
            try {
                const result = rule.decide(Object.freeze({ ...hit }));
                if (result === undefined) continue;
                if (result === false || (typeof result === "object" && result !== null && result.allow === false)) denied++; else allowed++;
                return result;
            } catch (error) {
                errors++; denied++;
                dependencies.warn?.(`PvP rule '${rule.resource}:${rule.id}' threw; hit vetoed: ${error instanceof Error ? error.message : String(error)}`);
                return false;
            }
        }
        if (lethalMode || dependencies.defaultDecision === "allow") { allowed++; return true; }
        denied++; return false;
    }

    function register(raw: HmpPvpRule): () => boolean {
        if (state === "stopped") throw new Error("hmp-pvp is stopped");
        if (!raw || typeof raw !== "object" || typeof raw.decide !== "function") throw new TypeError("PvP rule must include decide(hit)");
        const rule: HmpPvpRule = { id: clean(raw.id, "PvP rule id"), resource: clean(raw.resource, "PvP rule resource"), priority: Number(raw.priority), decide: raw.decide };
        if (!Number.isFinite(rule.priority)) throw new TypeError("PvP rule priority must be finite");
        const identity = key(rule.resource, rule.id);
        if (rules.has(identity)) throw new Error(`PvP rule '${identity}' is already registered`);
        rules.set(identity, rule);
        let active = true;
        return () => { if (!active) return false; active = false; return rules.delete(identity); };
    }

    function unregister(id: string, resource: string): boolean { return rules.delete(key(clean(resource, "PvP rule resource"), clean(id, "PvP rule id"))); }
    function cleanup(resource: string): number {
        const owner = String(resource || "").toLowerCase(); let count = 0;
        for (const [identity, rule] of rules) if (rule.resource === owner) { rules.delete(identity); count++; }
        return count;
    }
    function stop(): void { if (state === "stopped") return; rules.clear(); dependencies.clearPolicy(); state = "stopped"; }

    function setLethal(enabled: boolean, context: { resource?: string; actor?: unknown; reason?: string } = {}): boolean {
        if (state === "stopped") throw new Error("hmp-pvp is stopped");
        const next = enabled === true;
        if (next === lethalMode) return false;
        lethalMode = next;
        dependencies.applyMode(lethalMode);
        dependencies.modeChanged?.(lethalMode, { resource: String(context.resource || "unknown").slice(0, 100), actor: context.actor, reason: String(context.reason || "mode changed").slice(0, 300) });
        return true;
    }

    const service = Object.freeze({
        policy: Object.freeze({ register, unregister, clear: cleanup, get: (id: string, resource: string) => { const value = rules.get(key(String(resource).toLowerCase(), String(id).toLowerCase())); return value ? info(value) : null; }, list: (resource?: string) => ordered().filter((rule) => !resource || rule.resource === String(resource).toLowerCase()).map(info), evaluate }),
        mode: Object.freeze({ isLethal: () => lethalMode, setLethal, sync: (player?: { id: number } | null) => { if (state === "stopped") return false; dependencies.applyMode(lethalMode, player ? Number(player.id) : undefined); return true; } }),
        vitals: dependencies.vitals,
        status: () => ({ state, defaultDecision: dependencies.defaultDecision, lethalMode, rules: rules.size, evaluated, allowed, denied, errors, uptimeMs: now() - startedAt }),
        cleanup, stop,
    });
    dependencies.install(evaluate);
    dependencies.applyMode(lethalMode);
    return service;
}

export = { createPvpService };
