export interface HmpAudioOwner {
    /** Calling resource name. Every owned sound, alias, and bank lease is removed when it stops. */
    resource: string;
    /** Optional independent scope within the resource. Defaults to `default`. */
    id?: string;
}

export interface HmpAudioPosition {
    x: number;
    y: number;
    z: number;
}

export interface HmpAudioPlayer {
    id: number;
    nickname: string;
    connected?: boolean;
    position?: HmpAudioPosition;
    emit?(eventName: string, payload?: unknown): void;
    sendChat?(message: string): void;
}

export interface HmpAudioPlayOptions {
    /** Positional delivery radius in centimetres. Zero sends to every connected player. */
    range?: number;
    /** Soundbank loaded before playback, primarily for custom Wwise content. */
    bank?: string;
    /** Client-side lifetime in seconds. */
    duration?: number;
    /** Explicit Wwise terminator event. Normally discovered automatically. */
    stopEvent?: string;
    /** Disable the native terminator lookup while retaining playing-id cancellation. */
    autoStop?: boolean;
    /** Retain the Foundation handle until explicitly stopped, for custom sustains without a known terminator. */
    held?: boolean;
}

export type HmpAudioScope = "position" | "player" | "private" | "audience" | "all" | "local";

export interface HmpAudioPlayback {
    handle: string;
    owner: Required<HmpAudioOwner>;
    event: string;
    scope: HmpAudioScope;
    startedAt: number;
    targetPlayerIds: number[];
    position?: HmpAudioPosition;
    nativeCount: number;
    held: boolean;
    duration?: number;
    bank?: string;
}

export interface HmpAudioCatalogEntry {
    alias: string;
    event: string;
    owner: Required<HmpAudioOwner>;
}

export interface HmpAudioBankLease {
    bank: string;
    owners: Required<HmpAudioOwner>[];
}

export interface HmpAudioCatalogApi {
    resolve(aliasOrEvent: string): string;
    list(search?: string): HmpAudioCatalogEntry[];
    register(owner: HmpAudioOwner, aliases: Readonly<Record<string, string>>): () => boolean;
    unregister(owner: HmpAudioOwner): boolean;
    bankFor(aliasOrEvent: string): string;
    stopEventFor(aliasOrEvent: string): string;
}

export interface HmpAudioBanksApi {
    acquire(owner: HmpAudioOwner, bank: string): boolean;
    release(owner: HmpAudioOwner, bank: string): boolean;
    releaseOwner(owner: HmpAudioOwner): number;
    list(owner?: HmpAudioOwner): HmpAudioBankLease[];
}

export interface HmpAudioSoundsApiBase {
    stop(owner: HmpAudioOwner, handle: string): boolean;
    release(owner: HmpAudioOwner): number;
    cleanup(resource: string): number;
    get(handle: string): HmpAudioPlayback | null;
    list(owner?: HmpAudioOwner): HmpAudioPlayback[];
}

export interface HmpAudioServerSoundsApi<P = HmpAudioPlayer> extends HmpAudioSoundsApiBase {
    playAt(owner: HmpAudioOwner, aliasOrEvent: string, position: HmpAudioPosition, options?: HmpAudioPlayOptions): string | null;
    playOnPlayer(owner: HmpAudioOwner, player: P, aliasOrEvent: string, options?: HmpAudioPlayOptions): string | null;
    playForPlayer(owner: HmpAudioOwner, player: P, aliasOrEvent: string, options?: HmpAudioPlayOptions): string | null;
    playForPlayers(owner: HmpAudioOwner, players: Iterable<P>, aliasOrEvent: string, options?: HmpAudioPlayOptions): string | null;
    playForAll(owner: HmpAudioOwner, aliasOrEvent: string, options?: HmpAudioPlayOptions): string | null;
}

export interface HmpAudioClientSoundsApi extends HmpAudioSoundsApiBase {
    play(owner: HmpAudioOwner, aliasOrEvent: string, options?: Omit<HmpAudioPlayOptions, "range">): string | null;
    playAt(owner: HmpAudioOwner, aliasOrEvent: string, position: HmpAudioPosition, options?: Omit<HmpAudioPlayOptions, "range">): string | null;
}

export interface HmpAudioStatus {
    state: "ready" | "stopped";
    activeSounds: number;
    owners: number;
    aliases: number;
    banks: number;
    uptimeMs: number;
}

export interface HmpAudioServer<P = HmpAudioPlayer> {
    sounds: HmpAudioServerSoundsApi<P>;
    catalog: HmpAudioCatalogApi;
    banks: HmpAudioBanksApi;
    status(): HmpAudioStatus;
}

export interface HmpAudioClient {
    sounds: HmpAudioClientSoundsApi;
    catalog: HmpAudioCatalogApi;
    banks: HmpAudioBanksApi;
    status(): HmpAudioStatus;
}
