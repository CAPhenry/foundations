import type { HmpPositionHolder, HmpVector3Like } from "../types";

function read(value: unknown): HmpVector3Like | null {
    try {
        const candidate = value && typeof value === "object" && "position" in value ? value.position : value;
        if (!candidate || typeof candidate !== "object") return null;
        const record = candidate as Record<string, unknown>;
        const x = Number(record.x);
        const y = Number(record.y);
        const z = Number(record.z);
        if (![x, y, z].every(Number.isFinite)) return null;
        return { x, y, z };
    } catch (_) {
        return null;
    }
}

function distanceSquared(left: HmpVector3Like | HmpPositionHolder, right: HmpVector3Like | HmpPositionHolder): number {
    const a = read(left);
    const b = read(right);
    if (!a || !b) return Infinity;
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return dx * dx + dy * dy + dz * dz;
}

function distance(left: HmpVector3Like | HmpPositionHolder, right: HmpVector3Like | HmpPositionHolder): number {
    return Math.sqrt(distanceSquared(left, right));
}

function within(left: HmpVector3Like | HmpPositionHolder, right: HmpVector3Like | HmpPositionHolder, radius: number): boolean {
    const range = Number(radius);
    return Number.isFinite(range) && range >= 0 && distanceSquared(left, right) <= range * range;
}

export = Object.freeze({ read, distance, distanceSquared, within });
// TypeScript source.
