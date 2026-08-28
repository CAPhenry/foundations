import type { HmpCore, HmpCoreCharacter, HmpCoreSession } from "../../hmp-core/types";
import type { HmpLogger } from "../../hmp-lib/types";
import type { HmpSpawnLocationDefinition, HmpSpawnLocationInfo } from "../types";

export type Player = HogwartsMpPlayer;
export type Core = HmpCore<Player>;

export interface SpawnConfig extends Record<string, unknown> {
    showSelector: boolean;
    allowLastLocation: boolean;
    saveLastLocation: boolean;
    defaultLocation: string;
    teleportTimeoutMs: number;
    autoSaveMs: number;
    locations: HmpSpawnLocationDefinition[];
}

export interface NormalizedLocation extends HmpSpawnLocationDefinition {
    description: string;
    resource: string;
    snapToGround: boolean;
    groundSnapDistance: number;
}
export interface SpawnEvents { emit(eventName: string, payload: unknown): unknown }
export interface TimerHandle { unref?: () => void }

export interface SpawnFlowOptions {
    core: Core;
    events?: SpawnEvents | null;
    config?: Partial<SpawnConfig>;
    logger?: Pick<HmpLogger, "warn" | "error">;
    setTimer?: (callback: () => void, milliseconds: number) => TimerHandle;
    clearTimer?: (timer: TimerHandle) => void;
}

export interface CharacterSelectionPayload {
    session: HmpCoreSession<Player>;
    character: HmpCoreCharacter;
}

export interface SpawnContext {
    requestId: number;
    playerId: number;
    player: Player;
    session: HmpCoreSession<Player>;
    character: HmpCoreCharacter;
    location: NormalizedLocation;
    timer: TimerHandle | null;
}

export type { HmpSpawnLocationDefinition, HmpSpawnLocationInfo };
