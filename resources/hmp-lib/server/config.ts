import fs = require("node:fs");
import path = require("node:path");

const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function clone(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(clone);
    if (!isPlainObject(value)) return value;
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
        if (!BLOCKED_KEYS.has(key)) output[key] = clone(child);
    }
    return output;
}

function merge<T extends Record<string, unknown>>(...sources: Array<Partial<T> | null | undefined>): T {
    const output: Record<string, unknown> = {};
    for (const source of sources) {
        if (!isPlainObject(source)) continue;
        for (const [key, value] of Object.entries(source)) {
            if (BLOCKED_KEYS.has(key)) continue;
            if (isPlainObject(value) && isPlainObject(output[key])) output[key] = merge(output[key], value);
            else output[key] = clone(value);
        }
    }
    return output as T;
}

function load<T extends Record<string, unknown>>(
    candidates: string | string[],
    options: {
        cwd?: string;
        defaults?: Partial<T>;
        required?: boolean;
        fresh?: boolean;
        validate?: (config: T, source: string) => boolean | void;
    } = {},
): T {
    const paths = (Array.isArray(candidates) ? candidates : [candidates]).filter(Boolean);
    const cwd = options.cwd || process.cwd();
    let found = "";
    for (const candidate of paths) {
        const resolved = path.isAbsolute(candidate) ? candidate : path.resolve(cwd, candidate);
        if (fs.existsSync(resolved)) {
            found = resolved;
            break;
        }
    }

    if (!found) {
        if (options.required === true) {
            const error = new Error(`configuration not found; tried: ${paths.join(", ")}`);
            Object.assign(error, { code: "HMP_CONFIG_NOT_FOUND" });
            throw error;
        }
        return merge<T>(options.defaults || {});
    }

    if (options.fresh === true) delete require.cache[require.resolve(found)];
    const loaded: unknown = require(found);
    const value = isPlainObject(loaded) && loaded.__esModule && loaded.default ? loaded.default : loaded;
    if (!isPlainObject(value)) throw new TypeError(`configuration '${found}' must export a plain object`);
    const config = merge<T>(options.defaults || {}, value as Partial<T>);
    if (typeof options.validate === "function") {
        const verdict = options.validate(config, found);
        if (verdict === false) throw new TypeError(`configuration '${found}' failed validation`);
    }
    return config;
}

function envBoolean(value: unknown, fallback = false): boolean {
    if (value === undefined || value === null || value === "") return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    throw new TypeError(`'${value}' is not a boolean`);
}

function envNumber(
    value: unknown,
    fallback?: number,
    options: { integer?: boolean; min?: number; max?: number } = {},
): number | undefined {
    if (value === undefined || value === null || value === "") return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new TypeError(`'${value}' is not a finite number`);
    if (options.integer === true && !Number.isSafeInteger(parsed)) throw new TypeError(`'${value}' is not a safe integer`);
    if (options.min !== undefined && parsed < options.min) throw new RangeError(`'${value}' is below ${options.min}`);
    if (options.max !== undefined && parsed > options.max) throw new RangeError(`'${value}' is above ${options.max}`);
    return parsed;
}

function envJson<T = unknown>(value: unknown, fallback?: T): T {
    if (value === undefined || value === null || value === "") return fallback as T;
    return JSON.parse(String(value)) as T;
}

export = Object.freeze({
    load,
    merge,
    env: Object.freeze({ boolean: envBoolean, number: envNumber, json: envJson }),
});
// TypeScript source.
