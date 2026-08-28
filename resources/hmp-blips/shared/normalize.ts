import type {
    HmpBlipColor,
    HmpBlipMarkerDefinition,
    HmpBlipOwner,
    HmpBlipPlayer,
    HmpBlipPlayerGroupDefinition,
    HmpBlipPosition,
} from "../types";

const ID = /^[a-z0-9][a-z0-9_.:-]{0,95}$/i;
const RESOURCE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

function text(value: unknown, label: string, maximum: number, optional = false): string {
    const result = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
    if (!result && optional) return "";
    if (!result || result.length > maximum) throw new TypeError(`${label} must be ${optional ? "at most" : "a non-empty string up to"} ${maximum} characters`);
    return result;
}

function owner(raw: HmpBlipOwner): HmpBlipOwner & { key: string } {
    if (!raw || typeof raw !== "object") throw new TypeError("blip owner is required");
    const resource = text(raw.resource, "blip resource", 64).toLowerCase();
    const id = text(raw.id, "blip id", 96).toLowerCase();
    if (!RESOURCE.test(resource)) throw new TypeError("blip resource contains unsupported characters");
    if (!ID.test(id)) throw new TypeError("blip id contains unsupported characters");
    return { resource, id, key: `hmp:${resource}:${id}` };
}

function position(raw: HmpBlipPosition): HmpBlipPosition {
    if (!raw || typeof raw !== "object") throw new TypeError("blip position is required");
    const value = { x: Number(raw.x), y: Number(raw.y), z: Number(raw.z) };
    if (![value.x, value.y, value.z].every(Number.isFinite)) throw new TypeError("blip position must contain finite x, y, and z values");
    return value;
}

function bounded(value: unknown, label: string, fallback: number, minimum: number, maximum: number): number {
    if (value === undefined) return fallback;
    const result = Number(value);
    if (!Number.isFinite(result) || result < minimum || result > maximum) throw new RangeError(`${label} must be between ${minimum} and ${maximum}`);
    return result;
}

function context(raw: { areaId?: unknown; regionId?: unknown; virtualWorld?: unknown }) {
    const areaId = raw.areaId === undefined ? undefined : text(raw.areaId, "blip areaId", 160);
    const regionId = raw.regionId === undefined ? undefined : text(raw.regionId, "blip regionId", 160);
    const virtualWorld = raw.virtualWorld === undefined ? undefined : bounded(raw.virtualWorld, "blip virtualWorld", 0, 0, Number.MAX_SAFE_INTEGER);
    return { areaId, regionId, virtualWorld };
}

function marker<P extends HmpBlipPlayer>(raw: HmpBlipMarkerDefinition<P>, resolveTtl: (value: unknown) => number): HmpBlipMarkerDefinition<P> & { key: string } {
    const identity = owner(raw);
    if (raw.kind !== "marker" && raw.kind !== "circle") throw new TypeError("blip kind must be marker or circle");
    const normalizedContext = context(raw);
    const value: HmpBlipMarkerDefinition<P> & { key: string } = {
        ...identity,
        kind: raw.kind,
        position: position(raw.position),
        icon: text(raw.icon, "blip icon", 160, true),
        label: text(raw.label, "blip label", 120, true),
        showOnHud: raw.showOnHud !== false,
        showDistance: raw.showDistance !== false,
        ttl: resolveTtl(raw.ttl),
        audience: raw.audience,
        ...normalizedContext,
    };
    if (raw.kind === "circle") value.radius = bounded(raw.radius, "blip circle radius", 50, 0.1, 100_000);
    return value;
}

function color(raw: HmpBlipColor | undefined): [number, number, number, number] | null {
    if (raw === undefined) return null;
    let r: unknown, g: unknown, b: unknown, a: unknown;
    if (Array.isArray(raw)) [r, g, b, a] = raw;
    else { ({ r, g, b, a } = raw as { r: unknown; g: unknown; b: unknown; a?: unknown }); }
    return [
        bounded(r, "blip color r", 1, 0, 1),
        bounded(g, "blip color g", 1, 0, 1),
        bounded(b, "blip color b", 1, 0, 1),
        bounded(a, "blip color a", 1, 0, 1),
    ];
}

function playerGroup<P extends HmpBlipPlayer>(raw: HmpBlipPlayerGroupDefinition<P>): {
    resource: string;
    id: string;
    key: string;
    subjects: HmpBlipPlayerGroupDefinition<P>["subjects"];
    audience: HmpBlipPlayerGroupDefinition<P>["audience"];
    color: [number, number, number, number] | null;
    priority: number;
    sameArea: boolean;
    sameRegion: boolean;
    sameVirtualWorld: boolean;
} {
    const identity = owner(raw);
    return {
        ...identity,
        subjects: raw.subjects,
        audience: raw.audience,
        color: color(raw.color),
        priority: bounded(raw.priority, "player blip priority", 0, -1_000_000, 1_000_000),
        sameArea: raw.sameArea === true || raw.sameRegion === true,
        sameRegion: raw.sameRegion === true,
        sameVirtualWorld: raw.sameVirtualWorld === true,
    };
}

export = { owner, position, marker, playerGroup, color, text, bounded };
