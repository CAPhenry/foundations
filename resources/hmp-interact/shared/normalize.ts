import type {
    HmpInteractionDefinition,
    HmpInteractionOption,
    HmpInteractionProgress,
    HmpInteractionRequirements,
} from "../types";

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;

function clean(value: unknown, maximum = 120): string {
    return Array.from(String(value ?? ""), (character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127 ? " " : character;
    }).join("").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function finite(value: unknown, fallback: number, minimum: number, maximum: number): number {
    const number = Number(value);
    return Math.min(maximum, Math.max(minimum, Number.isFinite(number) ? number : fallback));
}

function id(value: unknown, name: string): string {
    const normalized = String(value ?? "").trim();
    if (!ID.test(normalized)) throw new TypeError(`${name} is invalid`);
    return normalized;
}

function requirements<P>(raw?: HmpInteractionRequirements<P>): HmpInteractionRequirements<P> | undefined {
    if (!raw) return undefined;
    const groups = (raw.groups || []).slice(0, 16).map((entry) => ({
        key: id(entry.key, "group key"),
        minimumGrade: Math.trunc(finite(entry.minimumGrade, 0, -100000, 100000)),
    }));
    const items = (raw.items || []).slice(0, 16).map((entry) => ({
        name: id(entry.name, "item name"),
        amount: Math.trunc(finite(entry.amount, 1, 1, 1000000)),
        metadata: entry.metadata && typeof entry.metadata === "object" && !Array.isArray(entry.metadata) ? { ...entry.metadata } : undefined,
    }));
    return Object.freeze({
        character: raw.character === true,
        groups: Object.freeze(groups),
        groupMode: raw.groupMode === "any" ? "any" : "all",
        items: Object.freeze(items),
        allow: typeof raw.allow === "function" ? raw.allow : undefined,
    });
}

function progress(raw?: HmpInteractionProgress): HmpInteractionProgress | undefined {
    if (!raw) return undefined;
    return Object.freeze({
        label: clean(raw.label, 100),
        duration: Math.trunc(finite(raw.duration, 1000, 100, 300000)),
        canCancel: raw.canCancel === true,
        cancelLabel: clean(raw.cancelLabel, 40) || undefined,
    });
}

function option<P>(raw: HmpInteractionOption<P>, seen: Set<string>): HmpInteractionOption<P> {
    if (!raw || typeof raw !== "object") throw new TypeError("interaction option is required");
    const optionId = id(raw.id, "interaction option id");
    if (seen.has(optionId)) throw new TypeError(`interaction option '${optionId}' is duplicated`);
    seen.add(optionId);
    if (typeof raw.handler !== "function") throw new TypeError(`interaction option '${optionId}' needs a handler`);
    return Object.freeze({
        id: optionId,
        label: clean(raw.label, 80) || optionId,
        description: clean(raw.description, 180) || undefined,
        icon: clean(raw.icon, 400) || undefined,
        requirements: requirements(raw.requirements),
        progress: progress(raw.progress),
        cooldownMs: raw.cooldownMs === undefined ? undefined : Math.trunc(finite(raw.cooldownMs, 0, 0, 3600000)),
        handler: raw.handler,
    });
}

function normalizeInteraction<P>(raw: HmpInteractionDefinition<P>): HmpInteractionDefinition<P> {
    if (!raw || typeof raw !== "object") throw new TypeError("interaction definition is required");
    const interactionId = id(raw.id, "interaction id");
    const resource = id(raw.resource, "interaction resource");
    const position = raw.position;
    if (!position || ![position.x, position.y, position.z].every((value) => Number.isFinite(Number(value)))) {
        throw new TypeError(`interaction '${interactionId}' needs a finite position`);
    }
    const radius = finite(raw.radius, 250, 25, 10000);
    const optionIds = new Set<string>();
    const options = (raw.options || []).slice(0, 24).map((entry) => option(entry, optionIds));
    if (!options.length && typeof raw.handler !== "function") throw new TypeError(`interaction '${interactionId}' needs a handler or options`);
    const object = raw.object ? {
        model: typeof raw.object.model === "string" ? clean(raw.object.model, 500) : raw.object.model,
        pitch: finite(raw.object.pitch, 0, -360000, 360000),
        yaw: finite(raw.object.yaw, 0, -360000, 360000),
        roll: finite(raw.object.roll, 0, -360000, 360000),
        scale: finite(raw.object.scale, 1, 0.01, 100),
        collision: raw.object.collision !== false,
    } : undefined;
    if (object && !((typeof object.model === "string" && clean(object.model, 500)) || Number.isFinite(Number(object.model)))) {
        throw new TypeError(`interaction '${interactionId}' has an invalid world-object model`);
    }
    return Object.freeze({
        id: interactionId,
        resource,
        label: clean(raw.label, 80) || interactionId,
        description: clean(raw.description, 180) || undefined,
        position: Object.freeze({ x: Number(position.x), y: Number(position.y), z: Number(position.z) }),
        radius,
        promptDistance: finite(raw.promptDistance, radius, 25, radius),
        promptOffsetZ: finite(raw.promptOffsetZ, 100, -1000, 5000),
        priority: Math.trunc(finite(raw.priority, 0, -100000, 100000)),
        virtualWorld: raw.virtualWorld === undefined ? undefined : Math.trunc(finite(raw.virtualWorld, 0, 0, 2147483647)),
        areaId: clean(raw.areaId, 128) || undefined,
        regionId: clean(raw.regionId, 128) || undefined,
        cooldownMs: Math.trunc(finite(raw.cooldownMs, 500, 0, 3600000)),
        exclusive: raw.exclusive === true,
        requirements: requirements(raw.requirements),
        progress: progress(raw.progress),
        object: object ? Object.freeze(object) : undefined,
        handler: typeof raw.handler === "function" ? raw.handler : undefined,
        options: Object.freeze(options),
    });
}

function publicZone<P>(definition: HmpInteractionDefinition<P>) {
    return {
        id: definition.id,
        label: definition.label,
        position: definition.position,
        promptDistance: definition.promptDistance || definition.radius || 250,
        promptOffsetZ: definition.promptOffsetZ ?? 100,
        priority: definition.priority || 0,
    };
}

export = { clean, normalizeInteraction, publicZone };
