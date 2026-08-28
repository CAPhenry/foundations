import type { HmpCoreCharacter, HmpCoreGroup } from "../hmp-core/types";

export interface HmpSpellPlayer {
    id: number;
    nickname: string;
    connected?: boolean;
    emit(eventName: string, payload?: unknown): void;
    sendChat?(message: string): void;
}

export interface HmpSpellDefinition {
    name: string;
    lockId: string;
}

export interface HmpSpellGroupRequirement {
    key: string;
    minimumGrade?: number;
}

export interface HmpSpellMatch {
    groups: ReadonlyArray<HmpSpellGroupRequirement>;
    groupMode?: "any" | "all";
}

export interface HmpSpellRule {
    id: string;
    resource: string;
    priority: number;
    action: "allow" | "deny";
    spells?: "*" | ReadonlyArray<string>;
    /** Allow rules may grant this many bonus diamonds. Omit to leave loadouts unmanaged. */
    bonusLoadouts?: number;
    match?: HmpSpellMatch;
}

export interface HmpResolvedSpellPolicy {
    unlockSpells: string[];
    /** null means the native game retains ownership of naturally earned loadout perks. */
    bonusLoadouts: number | null;
}

export interface HmpSpellEntitlements {
    spells: string[];
    bonusLoadouts: number | null;
}

export interface HmpSpellResolution<P = HmpSpellPlayer> {
    player: P;
    character: HmpCoreCharacter | null;
    groups: HmpCoreGroup[];
    entitlements: HmpSpellEntitlements;
    policy: HmpResolvedSpellPolicy;
}

export interface HmpSpellCatalogApi {
    resolve(spell: string): string | null;
    get(spell: string): HmpSpellDefinition | null;
    list(search?: string): HmpSpellDefinition[];
}

export interface HmpSpellPolicyApi<P = HmpSpellPlayer> {
    resolve(player: P): Promise<HmpSpellResolution<P>>;
    sync(player: P): Promise<HmpResolvedSpellPolicy>;
    syncAll(): Promise<number>;
}

export interface HmpSpellRulesApi<P = HmpSpellPlayer> {
    register(rule: HmpSpellRule): () => boolean;
    unregister(id: string, resource: string): boolean;
    clear(resource: string): number;
    list(resource?: string): HmpSpellRule[];
    refresh(): Promise<number>;
}

export interface HmpSpellGrantsApi<P = HmpSpellPlayer> {
    list(player: P): Promise<string[]>;
    grant(player: P, spell: string, context?: { resource?: string; actor?: P; reason?: string }): Promise<boolean>;
    revoke(player: P, spell: string, context?: { resource?: string; actor?: P; reason?: string }): Promise<boolean>;
    clear(player: P, context?: { resource?: string; actor?: P; reason?: string }): Promise<number>;
}

export interface HmpSpellLoadoutsApi<P = HmpSpellPlayer> {
    get(player: P): Promise<number | null>;
    set(player: P, bonusLoadouts: number, context?: { resource?: string; actor?: P; reason?: string }): Promise<boolean>;
    unmanage(player: P, context?: { resource?: string; actor?: P; reason?: string }): Promise<boolean>;
}

export interface HmpSpellsStatus {
    state: "ready" | "stopped";
    catalogSize: number;
    configuredRules: number;
    runtimeRules: number;
    syncedPlayers: number;
    uptimeMs: number;
}

export interface HmpSpellsServer<P = HmpSpellPlayer> {
    catalog: HmpSpellCatalogApi;
    policy: HmpSpellPolicyApi<P>;
    rules: HmpSpellRulesApi<P>;
    grants: HmpSpellGrantsApi<P>;
    loadouts: HmpSpellLoadoutsApi<P>;
    status(): HmpSpellsStatus;
}
