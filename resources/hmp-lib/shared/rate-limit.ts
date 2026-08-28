import type { HmpRateLimiter, HmpRateLimitResult } from "../types";

interface Bucket {
    used: number;
    dropped: number;
    resetAt: number;
    touchedAt: number;
}

function positiveInteger(value: unknown, name: string): number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive integer`);
    return value;
}

function create<K = string>(options: {
    limit: number;
    windowMs: number;
    now?: () => number;
    onDrop?: (result: HmpRateLimitResult<K>) => void;
}): HmpRateLimiter<K> {
    const limit = positiveInteger(options.limit, "limit");
    const windowMs = positiveInteger(options.windowMs, "windowMs");
    const now = typeof options.now === "function" ? options.now : Date.now;
    const onDrop = typeof options.onDrop === "function" ? options.onDrop : null;
    const buckets = new Map<K, Bucket>();

    function bucketFor(key: K, time: number): Bucket {
        let bucket = buckets.get(key);
        if (!bucket || time >= bucket.resetAt) {
            bucket = { used: 0, dropped: 0, resetAt: time + windowMs, touchedAt: time };
            buckets.set(key, bucket);
        }
        bucket.touchedAt = time;
        return bucket;
    }

    function snapshot(key: K, bucket: Bucket, allowed = true): HmpRateLimitResult<K> {
        return {
            key,
            allowed,
            limit,
            used: bucket.used,
            remaining: Math.max(0, limit - bucket.used),
            dropped: bucket.dropped,
            resetAt: bucket.resetAt,
        };
    }

    function take(key: K = "global" as K, cost = 1): HmpRateLimitResult<K> {
        positiveInteger(cost, "cost");
        const time = now();
        const bucket = bucketFor(key, time);
        if (bucket.used + cost <= limit) {
            bucket.used += cost;
            return snapshot(key, bucket, true);
        }
        bucket.dropped++;
        const result = snapshot(key, bucket, false);
        if (onDrop) onDrop(result);
        return result;
    }

    function allow(key: K = "global" as K, cost = 1): boolean {
        return take(key, cost).allowed;
    }

    function check(key: K = "global" as K): HmpRateLimitResult<K> {
        const time = now();
        const bucket = bucketFor(key, time);
        return snapshot(key, bucket, bucket.used < limit);
    }

    function reset(key: K = "global" as K): boolean {
        return buckets.delete(key);
    }

    function clear(): void {
        buckets.clear();
    }

    function sweep(maxIdleMs = windowMs * 2): number {
        const time = now();
        let removed = 0;
        for (const [key, bucket] of buckets) {
            if (time - bucket.touchedAt >= maxIdleMs) {
                buckets.delete(key);
                removed++;
            }
        }
        return removed;
    }

    function status(): { limit: number; windowMs: number; buckets: number } {
        return { limit, windowMs, buckets: buckets.size };
    }

    return Object.freeze({ allow, take, check, reset, clear, sweep, status });
}

export = Object.freeze({ create });
// TypeScript source.
