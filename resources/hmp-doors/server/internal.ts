import type { HmpCore, HmpCoreGroup } from "../../hmp-core/types";
import type { HmpDoorPlayer, HmpDoorRule, HmpDoorsServer } from "../types";

export interface DoorConfig {
    command: string;
    enableCommands: boolean;
    adminGroups: Array<{ key: string; minimumGrade?: number }>;
    rules: HmpDoorRule[];
}

export interface DoorDependencies<P extends HmpDoorPlayer> {
    core: HmpCore<P>;
    config: DoorConfig;
    players(): P[];
    now?: () => number;
}

export interface DoorService<P extends HmpDoorPlayer> extends HmpDoorsServer<P> {
    stop(): void;
}

export type EffectiveGroups = ReadonlyArray<Pick<HmpCoreGroup, "key" | "grade">>;
