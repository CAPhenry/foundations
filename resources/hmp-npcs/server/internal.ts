import type { HmpNpcDisposition } from "../types";

export interface NpcsConfig {
    maximumManagedNpcs: number;
    maximumPerResource: number;
}

export interface NativeNpc {
    readonly id: number;
    readonly enemyId: string;
    readonly disposition: HmpNpcDisposition;
    readonly alive: boolean;
    readonly ownerId?: number;
    readonly scale: number;
    readonly health: number;
    readonly maxHealth: number;
    setScale(scale: number): void;
    setMaxHealth(health: number): void;
    setHealth(health: number): void;
    destroy(): void;
}

export interface NativeNpcs {
    create(
        enemyId: string,
        x: number,
        y: number,
        z: number,
        disposition?: HmpNpcDisposition,
        preferredOwnerId?: number,
    ): NativeNpc | undefined;
}

export interface NpcsServiceOptions {
    config: NpcsConfig;
    native: NativeNpcs;
    now?: () => number;
}
