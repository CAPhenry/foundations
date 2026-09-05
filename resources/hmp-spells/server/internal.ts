import type { HmpCore, HmpCoreGroup } from "../../hmp-core/types";
import type { HmpSpellPlayer, HmpSpellRule, HmpSpellsServer } from "../types";

export interface SpellConfig {
    command: string;
    enableCommands: boolean;
    adminGroups: Array<{ key: string; minimumGrade?: number }>;
    rules: HmpSpellRule[];
    maxCastReportsPerSecond: number;
}

export interface SpellDependencies<P extends HmpSpellPlayer> {
    core: HmpCore<P>;
    config: SpellConfig;
    players(): P[];
    emit?(eventName: string, ...args: unknown[]): unknown;
    now?: () => number;
}

export interface SpellService<P extends HmpSpellPlayer> extends HmpSpellsServer<P> {
    // Client-originated slots are already applied locally; persist without replaying policy.
    acceptClientAssignments: HmpSpellsServer<P>["loadouts"]["setAssignments"];
    stop(): void;
}

export type EffectiveGroups = ReadonlyArray<Pick<HmpCoreGroup, "key" | "grade">>;
