import type {
    HmpControlLease,
    HmpInputApi,
    HmpInputOwner,
    HmpShortcutDefinition,
    HmpShortcutInfo,
    HmpShortcutState,
} from "../types";

interface KeyApi {
    bind(key: string, state: "both", handler: (key: string, state: "down" | "up") => void): boolean;
    unbind(key: string, state: "both", handler: (key: string, state: "down" | "up") => void): boolean;
    isDown(key: string): boolean;
}

interface GameApi { lockControls(locked: boolean): void; areControlsLocked(): boolean }
interface ConsoleApi { warn(...args: unknown[]): void; error(...args: unknown[]): void }

interface ShortcutRecord extends HmpShortcutInfo {
    when?: () => boolean;
    handler: (key: string, state: "down" | "up") => unknown;
    sequence: number;
}

const OWNER_PART = /^[a-z0-9][a-z0-9_.:-]{0,63}$/i;

function createInputApi(options: { key: KeyApi; game: GameApi; console?: ConsoleApi }): HmpInputApi & { stop(): void } {
    const { key, game } = options;
    const output = options.console || console;
    const controlOwners = new Map<string, HmpInputOwner>();
    const shortcuts = new Map<string, ShortcutRecord>();
    const buckets = new Map<string, (key: string, state: "down" | "up") => void>();
    const warnedConflicts = new Set<string>();
    let sequence = 0;
    let conflicts = 0;
    let stopped = false;
    let nativeControlLock = false;

    function part(value: unknown, label: string): string {
        const result = String(value || "").trim().toLowerCase();
        if (!OWNER_PART.test(result)) throw new TypeError(`${label} must be a namespaced identifier`);
        return result;
    }

    function owner(raw: HmpInputOwner): HmpInputOwner & { key: string } {
        if (!raw || typeof raw !== "object") throw new TypeError("input owner is required");
        const resource = part(raw.resource, "resource");
        const id = part(raw.id, "owner id");
        return { resource, id, key: `${resource}:${id}` };
    }

    function normalizeKey(value: unknown): string {
        const result = String(value || "").trim().toLowerCase();
        if (!result || result.length > 32) throw new TypeError("shortcut key is required");
        return result;
    }

    function normalizeState(value: unknown): HmpShortcutState {
        const state = String(value || "down").toLowerCase();
        if (state !== "down" && state !== "up" && state !== "both") throw new TypeError("shortcut state must be down, up, or both");
        return state;
    }

    function info(record: ShortcutRecord): HmpShortcutInfo {
        return { id: record.id, resource: record.resource, key: record.key, state: record.state, priority: record.priority, enabled: record.enabled };
    }

    function eligible(record: ShortcutRecord, state: "down" | "up"): boolean {
        if (!record.enabled || (record.state !== "both" && record.state !== state)) return false;
        try { return record.when ? record.when() === true : true; }
        catch (error) {
            output.error(`[hmp-input] ${record.resource}:${record.id} eligibility failed`, error);
            return false;
        }
    }

    function dispatch(physicalKey: string, state: "down" | "up"): void {
        const candidates = [...shortcuts.values()]
            .filter((record) => record.key === physicalKey && eligible(record, state))
            .sort((left, right) => right.priority - left.priority || left.sequence - right.sequence);
        if (!candidates.length) return;
        if (candidates.length > 1 && candidates[0].priority === candidates[1].priority) {
            conflicts++;
            const tied = candidates.filter((record) => record.priority === candidates[0].priority);
            const signature = `${physicalKey}:${state}:${candidates[0].priority}:${tied.map((record) => `${record.resource}:${record.id}`).join(",")}`;
            if (!warnedConflicts.has(signature)) {
                warnedConflicts.add(signature);
                output.warn(`[hmp-input] refusing ambiguous ${physicalKey}/${state} shortcut at priority ${candidates[0].priority}: ${tied.map((record) => `${record.resource}:${record.id}`).join(", ")}`);
            }
            return;
        }
        const selected = candidates[0];
        try { selected.handler(physicalKey, state); }
        catch (error) { output.error(`[hmp-input] ${selected.resource}:${selected.id} handler failed`, error); }
    }

    function ensureBucket(physicalKey: string): void {
        if (buckets.has(physicalKey)) return;
        const handler = (pressed: string, state: "down" | "up") => dispatch(pressed, state);
        key.bind(physicalKey, "both", handler);
        buckets.set(physicalKey, handler);
    }

    function removeBucketIfEmpty(physicalKey: string): void {
        if ([...shortcuts.values()].some((record) => record.key === physicalKey)) return;
        const handler = buckets.get(physicalKey);
        if (!handler) return;
        try { key.unbind(physicalKey, "both", handler); }
        catch (error) { output.error(`[hmp-input] could not unbind ${physicalKey}`, error); }
        buckets.delete(physicalKey);
    }

    function acquire(raw: HmpInputOwner): HmpControlLease {
        if (stopped) throw new Error("hmp-lib input manager is stopped");
        const value = owner(raw);
        if (controlOwners.has(value.key)) throw new Error(`control owner '${value.key}' already holds a lease`);
        if (!controlOwners.size) { game.lockControls(true); nativeControlLock = true; }
        controlOwners.set(value.key, { resource: value.resource, id: value.id });
        let released = false;
        return Object.freeze({
            resource: value.resource,
            id: value.id,
            release() {
                if (released) return false;
                released = true;
                return release(value);
            },
        });
    }

    function release(raw: HmpInputOwner): boolean {
        const value = owner(raw);
        if (!controlOwners.delete(value.key)) return false;
        if (!controlOwners.size && nativeControlLock) { game.lockControls(false); nativeControlLock = false; }
        return true;
    }

    function register(raw: HmpShortcutDefinition): () => boolean {
        if (stopped) throw new Error("hmp-lib input manager is stopped");
        if (!raw || typeof raw !== "object" || typeof raw.handler !== "function") throw new TypeError("shortcut handler is required");
        const value = owner(raw);
        if (shortcuts.has(value.key)) throw new Error(`shortcut '${value.key}' is already registered`);
        const physicalKey = normalizeKey(raw.key);
        ensureBucket(physicalKey);
        shortcuts.set(value.key, {
            id: value.id, resource: value.resource, key: physicalKey, state: normalizeState(raw.state),
            priority: Math.max(-1000, Math.min(1000, Math.trunc(Number(raw.priority)) || 0)), enabled: raw.enabled !== false,
            when: raw.when, handler: raw.handler, sequence: ++sequence,
        });
        let active = true;
        return () => {
            if (!active) return false;
            active = false;
            return unregister(value.id, value.resource);
        };
    }

    function unregister(id: string, resource?: string): boolean {
        const normalizedId = part(id, "shortcut id");
        const matches = [...shortcuts.entries()].filter(([, record]) => record.id === normalizedId && (!resource || record.resource === part(resource, "resource")));
        if (matches.length !== 1) return false;
        const [recordKey, record] = matches[0];
        shortcuts.delete(recordKey);
        removeBucketIfEmpty(record.key);
        return true;
    }

    function setEnabled(id: string, enabled: boolean, resource?: string): boolean {
        const record = [...shortcuts.values()].find((entry) => entry.id === part(id, "shortcut id") && (!resource || entry.resource === part(resource, "resource")));
        if (!record) return false;
        record.enabled = enabled === true;
        return true;
    }

    function rebind(id: string, physicalKey: string, resource?: string): boolean {
        const record = [...shortcuts.values()].find((entry) => entry.id === part(id, "shortcut id") && (!resource || entry.resource === part(resource, "resource")));
        if (!record) return false;
        const next = normalizeKey(physicalKey);
        if (next === record.key) return true;
        ensureBucket(next);
        const previous = record.key;
        record.key = next;
        removeBucketIfEmpty(previous);
        return true;
    }

    function cleanup(resource: string): number {
        const name = part(resource, "resource");
        let removed = 0;
        for (const [recordKey, record] of [...shortcuts]) {
            if (record.resource !== name) continue;
            shortcuts.delete(recordKey);
            removeBucketIfEmpty(record.key);
            removed++;
        }
        let controlRemoved = false;
        for (const [ownerKey, value] of [...controlOwners]) {
            if (value.resource !== name) continue;
            controlOwners.delete(ownerKey);
            controlRemoved = true;
            removed++;
        }
        if (controlRemoved && !controlOwners.size && nativeControlLock) { game.lockControls(false); nativeControlLock = false; }
        return removed;
    }

    function stop(): void {
        if (stopped) return;
        stopped = true;
        for (const [physicalKey, handler] of buckets) {
            try { key.unbind(physicalKey, "both", handler); } catch (_) {}
        }
        buckets.clear();
        shortcuts.clear();
        if (nativeControlLock) { game.lockControls(false); nativeControlLock = false; }
        controlOwners.clear();
    }

    return Object.freeze({
        controls: Object.freeze({
            acquire, release,
            held: (raw?: HmpInputOwner) => raw ? controlOwners.has(owner(raw).key) : controlOwners.size > 0,
            owners: () => [...controlOwners.values()].map((value) => ({ ...value })),
        }),
        shortcuts: Object.freeze({
            register, unregister, setEnabled, rebind,
            get(id: string, resource?: string) {
                const normalizedId = part(id, "shortcut id");
                const matches = [...shortcuts.values()].filter((entry) => entry.id === normalizedId && (!resource || entry.resource === part(resource, "resource")));
                return matches.length === 1 ? info(matches[0]) : null;
            },
            list: (resource?: string) => [...shortcuts.values()].filter((entry) => !resource || entry.resource === part(resource, "resource")).map(info),
            isDown: (physicalKey: string) => key.isDown(normalizeKey(physicalKey)),
        }),
        cleanup,
        status: () => ({ controlOwners: controlOwners.size, shortcuts: shortcuts.size, physicalKeys: buckets.size, conflicts }),
        stop,
    });
}

export = { createInputApi };
