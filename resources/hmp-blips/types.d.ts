import type { HmpCore } from "../hmp-core/types";

export interface HmpBlipPosition { x: number; y: number; z: number }

export interface HmpBlipPlayer {
    id: number;
    nickname: string;
    connected?: boolean;
    position: HmpBlipPosition;
    virtualWorld?: number;
    emit(eventName: string, payload?: unknown): void;
    sendChat?(message: string): void;
    location?(): HogwartsMpPlayerLocation | null;
}

export interface HmpBlipOwner {
    resource: string;
    id: string;
}

export interface HmpBlipGroupRequirement {
    key: string;
    minimumGrade?: number;
}

export type HmpBlipPlayerReference<P = HmpBlipPlayer> = P | number;
export type HmpBlipPlayerSource<P = HmpBlipPlayer> = Iterable<HmpBlipPlayerReference<P>> | (() => Iterable<HmpBlipPlayerReference<P>> | Promise<Iterable<HmpBlipPlayerReference<P>>>);

export interface HmpBlipSelector<P = HmpBlipPlayer> {
    players?: "all" | HmpBlipPlayerSource<P>;
    groups?: ReadonlyArray<HmpBlipGroupRequirement>;
    groupMode?: "any" | "all";
    areaId?: string;
    regionId?: string;
    virtualWorld?: number;
    where?: (player: P) => boolean | Promise<boolean>;
}

export type HmpBlipAudience<P = HmpBlipPlayer> = "all" | HmpBlipPlayerSource<P> | HmpBlipSelector<P>;
export type HmpBlipColor = readonly [number, number, number] | readonly [number, number, number, number] | { r: number; g: number; b: number; a?: number };

export interface HmpBlipMarkerDefinition<P = HmpBlipPlayer> extends HmpBlipOwner {
    kind: "marker" | "circle";
    position: HmpBlipPosition;
    /** Search-circle radius in metres. */
    radius?: number;
    icon?: string;
    label?: string;
    showOnHud?: boolean;
    showDistance?: boolean;
    /** Seconds. Omitted uses the server default; zero requests permanence. */
    ttl?: number;
    audience?: HmpBlipAudience<P>;
    areaId?: string;
    regionId?: string;
    virtualWorld?: number;
}

export interface HmpBlipMarkerInfo extends HmpBlipOwner {
    key: string;
    kind: "marker" | "circle";
    position: HmpBlipPosition;
    radius?: number;
    icon: string;
    label: string;
    showOnHud: boolean;
    showDistance: boolean;
    ttl: number;
    expiresAt: number | null;
    scoped: boolean;
    areaId?: string;
    regionId?: string;
    virtualWorld?: number;
}

export interface HmpBlipPlayerGroupDefinition<P = HmpBlipPlayer> extends HmpBlipOwner {
    subjects?: HmpBlipAudience<P>;
    audience?: HmpBlipAudience<P>;
    color?: HmpBlipColor;
    priority?: number;
    sameArea?: boolean;
    sameRegion?: boolean;
    sameVirtualWorld?: boolean;
}

export interface HmpBlipPlayerGroupInfo extends HmpBlipOwner {
    key: string;
    color: [number, number, number, number] | null;
    priority: number;
    scopedSubjects: boolean;
    scopedAudience: boolean;
    sameArea: boolean;
    sameRegion: boolean;
    sameVirtualWorld: boolean;
}

export interface HmpBlipMarkersApi<P = HmpBlipPlayer> {
    upsert(definition: HmpBlipMarkerDefinition<P>): Promise<HmpBlipMarkerInfo>;
    remove(id: string, resource: string): boolean;
    clear(resource: string): number;
    get(id: string, resource: string): HmpBlipMarkerInfo | null;
    list(resource?: string): HmpBlipMarkerInfo[];
    pulse(id: string, resource: string, pulse?: boolean): boolean;
    sync(player?: P): Promise<number>;
}

export interface HmpBlipPlayersApi<P = HmpBlipPlayer> {
    track(definition: HmpBlipPlayerGroupDefinition<P>): Promise<HmpBlipPlayerGroupInfo>;
    untrack(id: string, resource: string): Promise<boolean>;
    clear(resource: string): Promise<number>;
    get(id: string, resource: string): HmpBlipPlayerGroupInfo | null;
    list(resource?: string): HmpBlipPlayerGroupInfo[];
    refresh(player?: P): Promise<number>;
}

export interface HmpBlipsStatus {
    state: "ready" | "stopped";
    markers: number;
    playerGroups: number;
    expiringMarkers: number;
    showAllPlayers: boolean;
    uptimeMs: number;
}

export interface HmpBlipsServer<P = HmpBlipPlayer> {
    markers: HmpBlipMarkersApi<P>;
    players: HmpBlipPlayersApi<P>;
    status(): HmpBlipsStatus;
}

export interface HmpBlipsDependencies<P extends HmpBlipPlayer = HmpBlipPlayer> {
    core: Pick<HmpCore<P>, "groups">;
    players(): P[];
}

export interface HmpBlipsClientStatus {
    state: "ready" | "stopped";
    markers: number;
    coloredPlayers: number;
    trackAllPlayers: boolean;
    uptimeMs: number;
}

export interface HmpBlipsClient {
    status(): HmpBlipsClientStatus;
}
