import type { HmpInteractClient, HmpInteractionClientZone } from "../types";

interface ClientEvents {
    on(eventName: string, listener: (payload?: unknown) => unknown): void;
    emitServer(eventName: string, payload?: unknown): unknown;
}

interface ClientInput {
    shortcuts: {
        register(definition: {
            resource: string; id: string; key: string; state?: "down" | "up" | "both"; priority?: number;
            when?: () => boolean; handler(key: string, state: "down" | "up"): unknown;
        }): () => boolean;
    };
}

interface ClientHud {
    showPrompt(key: string, label: string, x: number, y: number, z: number): void;
    hidePrompt(): void;
}

interface ClientPlayer {
    getPosition(): { x: number; y: number; z: number } | null;
}

interface ClientGame {
    areControlsLocked(): boolean;
}

interface TimerApi {
    setInterval(handler: () => void, milliseconds: number): ReturnType<typeof setInterval>;
    clearInterval(timer: ReturnType<typeof setInterval>): void;
}

function parse(raw: unknown): Record<string, unknown> {
    if (typeof raw === "string") {
        try { return JSON.parse(raw) as Record<string, unknown>; }
        catch (_) { return {}; }
    }
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
}

function zone(raw: unknown): HmpInteractionClientZone | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const value = raw as Record<string, unknown>;
    const position = value.position as Record<string, unknown> | undefined;
    const id = String(value.id || "");
    const label = String(value.label || "").slice(0, 80);
    const coordinates = [position?.x, position?.y, position?.z].map(Number);
    const promptDistance = Number(value.promptDistance);
    if (!id || !label || !coordinates.every(Number.isFinite) || !Number.isFinite(promptDistance) || promptDistance <= 0) return null;
    return {
        id,
        label,
        position: { x: coordinates[0], y: coordinates[1], z: coordinates[2] },
        promptDistance,
        promptOffsetZ: Number.isFinite(Number(value.promptOffsetZ)) ? Number(value.promptOffsetZ) : 100,
        priority: Number.isFinite(Number(value.priority)) ? Number(value.priority) : 0,
    };
}

function createInteractClient(options: {
    events: ClientEvents;
    input: ClientInput;
    hud: ClientHud;
    localPlayer: ClientPlayer;
    game: ClientGame;
    timers?: TimerApi;
    now?: () => number;
}): HmpInteractClient & { receiveSnapshot(payload: unknown): boolean; scan(): HmpInteractionClientZone | null; stop(): boolean } {
    const timers = options.timers || { setInterval, clearInterval };
    const now = options.now || Date.now;
    const zones = new Map<string, HmpInteractionClientZone>();
    let enabled = true;
    let ready = false;
    let revision = -1;
    let active: HmpInteractionClientZone | null = null;
    let promptSignature = "";
    let lastPressAt = 0;
    let stopped = false;

    function hide(): void {
        const ownedPrompt = promptSignature !== "";
        active = null;
        promptSignature = "";
        if (ownedPrompt) options.hud.hidePrompt();
    }

    function scan(): HmpInteractionClientZone | null {
        if (!enabled || stopped || options.game.areControlsLocked()) { hide(); return null; }
        const position = options.localPlayer.getPosition();
        if (!position) { hide(); return null; }
        let nearest: { zone: HmpInteractionClientZone; distance: number } | null = null;
        for (const candidate of zones.values()) {
            const measured = Math.hypot(position.x - candidate.position.x, position.y - candidate.position.y, position.z - candidate.position.z);
            if (measured > candidate.promptDistance) continue;
            if (!nearest || candidate.priority > nearest.zone.priority || (candidate.priority === nearest.zone.priority && (measured < nearest.distance || (measured === nearest.distance && candidate.id < nearest.zone.id)))) {
                nearest = { zone: candidate, distance: measured };
            }
        }
        if (!nearest) { hide(); return null; }
        active = nearest.zone;
        const signature = `${active.id}\0${active.label}\0${active.position.x}\0${active.position.y}\0${active.position.z}\0${active.promptOffsetZ}`;
        if (signature !== promptSignature) {
            promptSignature = signature;
            options.hud.showPrompt("F", active.label, active.position.x, active.position.y, active.position.z + active.promptOffsetZ);
        }
        return active;
    }

    function receiveSnapshot(payload: unknown): boolean {
        const value = parse(payload);
        const nextRevision = Number(value.revision);
        if (!Number.isSafeInteger(nextRevision) || nextRevision < revision || !Array.isArray(value.interactions)) return false;
        const next = new Map<string, HmpInteractionClientZone>();
        for (const raw of value.interactions.slice(0, 5000)) {
            const normalized = zone(raw);
            if (normalized) next.set(normalized.id, normalized);
        }
        zones.clear();
        for (const [id, interaction] of next) zones.set(id, interaction);
        revision = nextRevision;
        ready = true;
        scan();
        return true;
    }

    function onInteract(): void {
        if (!enabled || stopped || options.game.areControlsLocked()) return;
        const current = scan();
        const time = now();
        if (!current || time - lastPressAt < 250) return;
        lastPressAt = time;
        options.events.emitServer("hmp-interact:trigger", JSON.stringify({ id: current.id, revision }));
    }

    function setEnabled(value: boolean): boolean {
        enabled = value === true;
        if (!enabled) hide();
        else scan();
        return enabled;
    }

    function stop(): boolean {
        if (stopped) return false;
        stopped = true;
        timers.clearInterval(timer);
        removeShortcut();
        hide();
        zones.clear();
        return true;
    }

    const removeShortcut = options.input.shortcuts.register({
        resource: "hmp-interact", id: "interact", key: "f", state: "down", priority: 0,
        when: () => enabled && !stopped && !options.game.areControlsLocked() && Boolean(scan()),
        handler: () => onInteract(),
    });
    options.events.on("hmp-interact:snapshot", receiveSnapshot);
    const timer = timers.setInterval(scan, 100);
    options.events.emitServer("hmp-interact:ready", "{}");

    return Object.freeze({
        setEnabled,
        status: () => ({ enabled, ready, revision, interactions: zones.size, active: active?.id || null }),
        receiveSnapshot,
        scan,
        stop,
    });
}

export = { createInteractClient };
