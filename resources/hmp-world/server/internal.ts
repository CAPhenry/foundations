import type {
    HmpWorldDateConfig,
    HmpWorldEnvironmentConfig,
    HmpWorldEnvironmentState,
    HmpWorldPlayer,
    HmpWorldPolicy,
    HmpWorldSeason,
} from "../types";

export interface WorldConfig {
    environment: HmpWorldEnvironmentConfig;
    policy: HmpWorldPolicy;
}

export interface NativeEnvironment {
    state(): HmpWorldEnvironmentState | null;
    setWeather(name: string): boolean;
    setTime(hour: number, minute: number, second?: number): boolean;
    setDate(day: number, month: number, year?: number): boolean;
    setSeason(season: number): boolean;
    setTimeScale(minutesPerSecond: number): boolean;
    getTimeScale(): number;
}

export interface WorldEvents<P extends HmpWorldPlayer> {
    emitAllClients(eventName: string, payload?: unknown): void;
}

export interface WorldServiceOptions<P extends HmpWorldPlayer> {
    config: WorldConfig;
    native: NativeEnvironment;
    events: WorldEvents<P>;
    players(): P[];
    now?: () => number;
}

export const SEASONS: Readonly<Record<Exclude<HmpWorldSeason, number>, 0 | 1 | 2 | 3>> = Object.freeze({
    spring: 0,
    summer: 1,
    autumn: 2,
    winter: 3,
});

export type { HmpWorldDateConfig };
