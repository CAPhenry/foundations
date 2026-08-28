function finite(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function integer(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : fallback;
}

function clamp(value: unknown, minimum: number, maximum: number): number {
    const min = finite(minimum);
    const max = finite(maximum);
    if (min > max) throw new RangeError("minimum cannot be greater than maximum");
    return Math.min(max, Math.max(min, finite(value, min)));
}

function between(value: unknown, minimum: number, maximum: number, inclusive = true): boolean {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return false;
    return inclusive
        ? parsed >= minimum && parsed <= maximum
        : parsed > minimum && parsed < maximum;
}

export = Object.freeze({ finite, integer, clamp, between });
// TypeScript source.
