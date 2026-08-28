import type { HmpResolvedDoorPolicy } from "../types";

interface NativeDoors {
    setLock(lockId: string, unlocked?: boolean): boolean;
    superAlohomora(enable?: boolean): boolean;
    list(radius?: number): Array<{ name: string; cls: string; dist: number; bearing: number }>;
    openNearby(radius?: number): number;
    unlockNearby(radius?: number): number;
    setOpen(name: string, open?: boolean): boolean;
    setPolicy(policy: { unlockAll?: boolean; unlockDoors?: string[]; unlockAllExcept?: string[] }): void;
}

interface ClientDependencies {
    doors: NativeDoors;
    events: { emitServer(eventName: string, payload?: unknown): void };
    notify?(message: string): void;
    log?(message: string): void;
}

function parsePayload(raw: unknown): Record<string, unknown> {
    if (typeof raw === "string") {
        try { return JSON.parse(raw) as Record<string, unknown>; }
        catch (_) { return {}; }
    }
    return raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
}

function stringList(value: unknown): string[] {
    return Array.isArray(value) ? [...new Set(value.filter((entry): entry is string => typeof entry === "string" && !!entry.trim()).map((entry) => entry.trim()))] : [];
}

function normalizePolicy(raw: unknown): HmpResolvedDoorPolicy {
    const value = parsePayload(raw);
    return {
        unlockAll: value.unlockAll === true,
        unlockDoors: stringList(value.unlockDoors),
        unlockAllExcept: stringList(value.unlockAllExcept),
        unlockLocks: stringList(value.unlockLocks),
        superAlohomora: value.superAlohomora === true,
    };
}

function createDoorClient(dependencies: ClientDependencies) {
    const { doors } = dependencies;
    let current = normalizePolicy({});
    let ready = false;
    let stopped = false;

    function apply(raw: unknown): HmpResolvedDoorPolicy {
        if (stopped) return current;
        const next = normalizePolicy(raw);
        const nextLocks = new Set(next.unlockLocks);
        for (const lockId of current.unlockLocks) if (!nextLocks.has(lockId)) doors.setLock(lockId, false);
        for (const lockId of next.unlockLocks) doors.setLock(lockId, true);
        doors.superAlohomora(next.superAlohomora);
        doors.setPolicy({ unlockAll: next.unlockAll, unlockDoors: next.unlockDoors, unlockAllExcept: next.unlockAllExcept });
        current = next;
        ready = true;
        return current;
    }

    function list(radius: number = 3000) {
        const bounded = Math.max(100, Math.min(20000, Number(radius) || 3000));
        const found = doors.list(bounded);
        dependencies.log?.(`[hmp-doors] ${found.length} door(s) within ${bounded}cm (distance | bearing | name):`);
        for (const door of found) dependencies.log?.(`  ${door.dist.toFixed(0)}cm | ${door.bearing.toFixed(0)}deg | ${door.name} [${door.cls}]`);
        dependencies.notify?.(`[doors] ${found.length} nearby door(s); details are in the client console`);
        return found;
    }

    function diagnostic(raw: unknown): number | boolean | unknown[] {
        const value = parsePayload(raw);
        const action = String(value.action || "");
        const radius = Math.max(100, Math.min(20000, Number(value.radius) || (action === "list" ? 3000 : 1500)));
        if (action === "list") return list(radius);
        if (action === "open-nearby") return doors.openNearby(radius);
        if (action === "unlock-nearby") return doors.unlockNearby(radius);
        if (action === "set-open") return doors.setOpen(String(value.name || ""), value.open !== false);
        return false;
    }

    function stop(): void {
        if (stopped) return;
        stopped = true;
        for (const lockId of current.unlockLocks) doors.setLock(lockId, false);
        doors.superAlohomora(false);
        doors.setPolicy({ unlockAll: false, unlockDoors: [], unlockAllExcept: [] });
        current = normalizePolicy({});
        ready = false;
    }

    dependencies.events.emitServer("hmp-doors:ready");
    return Object.freeze({ apply, list, diagnostic, stop, status: () => ({ ready, stopped, policy: current }) });
}

export = { createDoorClient, normalizePolicy, parsePayload };
