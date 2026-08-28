import banksModule = require("../shared/banks");
import catalogModule = require("../shared/catalog");
import defaultsModule = require("../shared/defaults");
import normalizeModule = require("../shared/normalize");
import type {
    HmpAudioClient,
    HmpAudioOwner,
    HmpAudioPlayback,
    HmpAudioPlayOptions,
    HmpAudioPosition,
} from "../types";
import type { NativeClientAudio } from "./internal";

const { createBankRegistry } = banksModule;
const { createCatalog } = catalogModule;
const { aliases: defaultAliases } = defaultsModule;
const { aliases: normalizeAliases, options: normalizeOptions, owner: normalizeOwner, position: normalizePosition } = normalizeModule;

interface ClientDependencies {
    native: NativeClientAudio;
    now?: () => number;
    setTimer?: (handler: () => void, delay: number) => ReturnType<typeof setTimeout>;
    clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
    maxActivePerOwner?: number;
    oneShotHandleMs?: number;
}

interface PlaybackRecord extends HmpAudioPlayback {
    ownerKey: string;
    nativeIds: number[];
    timer?: ReturnType<typeof setTimeout>;
}

function createAudioClient(dependencies: ClientDependencies): HmpAudioClient & {
    applyCatalog(payload: unknown): boolean;
    cleanup(resource: string): number;
    stop(): void;
} {
    const { native } = dependencies;
    const now = dependencies.now || Date.now;
    const setTimer = dependencies.setTimer || setTimeout;
    const clearTimer = dependencies.clearTimer || clearTimeout;
    const maxActivePerOwner = dependencies.maxActivePerOwner || 128;
    const oneShotHandleMs = dependencies.oneShotHandleMs || 60_000;
    const startedAt = now();
    const playbacks = new Map<string, PlaybackRecord>();
    const catalogRegistry = createCatalog(defaultAliases, {
        bankFor: native.bankFor.bind(native),
        stopEventFor: native.stopEventFor.bind(native),
    }, { resource: "hmp-audio", id: "server" });
    const bankRegistry = createBankRegistry({ load: native.loadBank.bind(native), unload: native.unloadBank.bind(native) });
    let sequence = 0;
    let stopped = false;

    function publicPlayback(record: PlaybackRecord): HmpAudioPlayback {
        const { ownerKey: _ownerKey, nativeIds, timer: _timer, ...playback } = record;
        return { ...playback, owner: { ...playback.owner }, targetPlayerIds: [], position: playback.position ? { ...playback.position } : undefined, nativeCount: nativeIds.length };
    }

    function activeFor(ownerKey: string): number {
        let count = 0;
        for (const record of playbacks.values()) if (record.ownerKey === ownerKey) count++;
        return count;
    }

    function finalize(record: PlaybackRecord, stopNative: boolean): boolean {
        if (playbacks.get(record.handle) !== record) return false;
        playbacks.delete(record.handle);
        if (record.timer) clearTimer(record.timer);
        if (stopNative) for (const nativeId of record.nativeIds) native.stopSound(nativeId);
        return true;
    }

    function playInternal(rawOwner: HmpAudioOwner, aliasOrEvent: string, rawPosition: HmpAudioPosition | null, rawOptions?: Omit<HmpAudioPlayOptions, "range">): string | null {
        const owner = normalizeOwner(rawOwner);
        if (stopped) throw new Error("hmp-audio client is stopped");
        if (activeFor(owner.key) >= maxActivePerOwner) throw new Error(`audio owner '${owner.key}' reached its ${maxActivePerOwner} active-sound limit`);
        const event = catalogRegistry.api.resolve(aliasOrEvent);
        const options = normalizeOptions(rawOptions, false);
        if (options.bank && !bankRegistry.api.acquire(owner, options.bank) && !bankRegistry.api.list(owner).some((entry) => entry.bank.toLowerCase() === options.bank!.toLowerCase())) return null;
        const { held: _held, bank: _bank, ...nativeOptions } = options;
        const position = rawPosition ? normalizePosition(rawPosition) : null;
        const nativeId = position
            ? native.playSoundAt(event, position.x, position.y, position.z, nativeOptions)
            : native.playSound(event, nativeOptions);
        if (!Number.isFinite(Number(nativeId)) || Number(nativeId) <= 0) return null;
        const knownTerminator = options.autoStop === false ? "" : String(options.stopEvent || native.stopEventFor(event) || "");
        const held = options.duration === undefined && (options.held === true || Boolean(knownTerminator));
        const record: PlaybackRecord = {
            handle: `hmpaud-local:${(++sequence).toString(36)}`,
            owner: { resource: owner.resource, id: owner.id },
            ownerKey: owner.key,
            event,
            scope: position ? "position" : "local",
            startedAt: now(),
            targetPlayerIds: [],
            position: position || undefined,
            nativeIds: [Number(nativeId)],
            nativeCount: 1,
            held,
            duration: options.duration,
            bank: options.bank,
        };
        playbacks.set(record.handle, record);
        if (options.duration !== undefined) record.timer = setTimer(() => finalize(record, false), Math.ceil(options.duration * 1000) + 1000);
        else if (!held) record.timer = setTimer(() => finalize(record, false), oneShotHandleMs);
        return record.handle;
    }

    function stop(rawOwner: HmpAudioOwner, handle: string): boolean {
        const owner = normalizeOwner(rawOwner);
        const record = playbacks.get(String(handle || ""));
        return Boolean(record && record.ownerKey === owner.key && finalize(record, true));
    }

    function release(rawOwner: HmpAudioOwner): number {
        const owner = normalizeOwner(rawOwner);
        let released = 0;
        for (const record of [...playbacks.values()]) if (record.ownerKey === owner.key && finalize(record, true)) released++;
        return released;
    }

    function cleanupSounds(resource: string): number {
        const normalized = normalizeOwner({ resource, id: "cleanup" }).resource;
        let released = 0;
        for (const record of [...playbacks.values()]) if (record.owner.resource === normalized && finalize(record, true)) released++;
        return released;
    }

    function cleanup(resource: string): number {
        return cleanupSounds(resource) + bankRegistry.cleanup(resource) + catalogRegistry.cleanup(resource);
    }

    function applyCatalog(payload: unknown): boolean {
        try {
            const parsed = typeof payload === "string" ? JSON.parse(payload) as unknown : payload;
            if (!parsed || typeof parsed !== "object" || !("aliases" in parsed)) return false;
            catalogRegistry.replace({ resource: "hmp-audio", id: "server" }, normalizeAliases((parsed as { aliases: Record<string, string> }).aliases));
            return true;
        } catch (_) {
            return false;
        }
    }

    function get(handle: string): HmpAudioPlayback | null {
        const record = playbacks.get(String(handle || ""));
        return record ? publicPlayback(record) : null;
    }

    function list(rawOwner?: HmpAudioOwner): HmpAudioPlayback[] {
        const owner = rawOwner ? normalizeOwner(rawOwner) : null;
        return [...playbacks.values()]
            .filter((record) => !owner || record.ownerKey === owner.key)
            .sort((left, right) => left.startedAt - right.startedAt)
            .map(publicPlayback);
    }

    function stopService(): void {
        if (stopped) return;
        stopped = true;
        for (const record of [...playbacks.values()]) finalize(record, true);
        bankRegistry.stop();
    }

    const sounds = Object.freeze({
        play: (owner: HmpAudioOwner, event: string, options?: Omit<HmpAudioPlayOptions, "range">) => playInternal(owner, event, null, options),
        playAt: (owner: HmpAudioOwner, event: string, position: HmpAudioPosition, options?: Omit<HmpAudioPlayOptions, "range">) => playInternal(owner, event, position, options),
        stop,
        release,
        cleanup: cleanupSounds,
        get,
        list,
    });
    return {
        sounds,
        catalog: catalogRegistry.api,
        banks: bankRegistry.api,
        status: () => ({
            state: stopped ? "stopped" : "ready",
            activeSounds: playbacks.size,
            owners: new Set([...playbacks.values()].map((record) => record.ownerKey)).size,
            aliases: catalogRegistry.count(),
            banks: bankRegistry.count(),
            uptimeMs: Math.max(0, now() - startedAt),
        }),
        applyCatalog,
        cleanup,
        stop: stopService,
    };
}

export = { createAudioClient };
