export type HmpEmoteKind = "pose" | "ability";
export type HmpEmoteChannel = "FullBody" | "PartialBody";

export interface HmpEmotePlayer {
    id: number;
    nickname: string;
    connected?: boolean;
    emit(eventName: string, payload?: unknown): void;
    sendChat?(message: string): void;
}

export interface HmpEmoteDefinition {
    name: string;
    path: string;
    kind: HmpEmoteKind;
    channel: HmpEmoteChannel;
    /** Resource-owned registrations are removed automatically when that resource stops. */
    resource?: string;
}

export interface HmpEmoteAliasRecord extends HmpEmoteDefinition {
    source: "config" | "resource" | "database";
    hidden?: boolean;
    updatedByAccountId?: number | null;
    updatedAt?: string | Date | null;
}

export interface HmpEmotesApi<P = HmpEmotePlayer> {
    list(): HmpEmoteDefinition[];
    get(name: string): HmpEmoteDefinition | null;
    play(player: P, name: string): Promise<boolean>;
    stop(player: P): boolean;
}

export interface HmpEmoteAliasesApi<P = HmpEmotePlayer> {
    register(definition: HmpEmoteDefinition): () => boolean;
    unregister(name: string, resource?: string): boolean;
    list(): HmpEmoteAliasRecord[];
    get(name: string): HmpEmoteAliasRecord | null;
    set(actor: P, definition: HmpEmoteDefinition): Promise<HmpEmoteAliasRecord>;
    hide(actor: P, name: string): Promise<boolean>;
    clearPath(actor: P, path: string): Promise<number>;
}

export interface HmpEmoteFavoritesApi<P = HmpEmotePlayer> {
    list(player: P): Promise<string[]>;
    toggle(player: P, path: string): Promise<string[]>;
}

export interface HmpEmoteUiApi<P = HmpEmotePlayer> {
    open(player: P): Promise<boolean>;
    close(player: P): boolean;
    sync(player: P): Promise<boolean>;
}

export interface HmpEmotesStatus {
    state: "starting" | "ready" | "degraded" | "stopped";
    lastError: string;
    aliases: number;
    configuredAliases: number;
    registeredAliases: number;
    persistedOverrides: number;
    readyClients: number;
    openMenus: number;
    uptimeMs: number;
}

export interface HmpEmotesServer<P = HmpEmotePlayer> {
    emotes: HmpEmotesApi<P>;
    aliases: HmpEmoteAliasesApi<P>;
    favorites: HmpEmoteFavoritesApi<P>;
    ui: HmpEmoteUiApi<P>;
    status(): HmpEmotesStatus;
}
