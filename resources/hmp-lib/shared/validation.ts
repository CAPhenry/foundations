import type {
    HmpArrayValidationOptions,
    HmpBooleanValidationOptions,
    HmpNumberValidationOptions,
    HmpStringValidationOptions,
} from "../types";

function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!isObject(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function fail(name: string | undefined, message: string): never {
    throw new TypeError(`${name || "value"} ${message}`);
}

function string(value: unknown, options: HmpStringValidationOptions = {}): string {
    const name = options.name || "value";
    if (typeof value !== "string") fail(name, "must be a string");
    const output = options.trim === false ? value : value.trim();
    const minimum = options.minLength ?? 0;
    const maximum = options.maxLength ?? Infinity;
    if (output.length < minimum) fail(name, `must contain at least ${minimum} character(s)`);
    if (output.length > maximum) fail(name, `must contain at most ${maximum} character(s)`);
    if (options.pattern && !options.pattern.test(output)) fail(name, "has an invalid format");
    return output;
}

function number(value: unknown, options: HmpNumberValidationOptions = {}): number {
    const name = options.name || "value";
    const parsed = options.coerce === true ? Number(value) : value;
    if (typeof parsed !== "number" || !Number.isFinite(parsed)) fail(name, "must be a finite number");
    if (options.integer === true && !Number.isSafeInteger(parsed)) fail(name, "must be a safe integer");
    if (options.min !== undefined && parsed < options.min) fail(name, `must be at least ${options.min}`);
    if (options.max !== undefined && parsed > options.max) fail(name, `must be at most ${options.max}`);
    return parsed;
}

function boolean(value: unknown, options: HmpBooleanValidationOptions = {}): boolean {
    const name = options.name || "value";
    if (typeof value === "boolean") return value;
    if (options.coerce === true) {
        if (value === 1 || ["true", "1", "yes", "on"].includes(String(value).trim().toLowerCase())) return true;
        if (value === 0 || ["false", "0", "no", "off"].includes(String(value).trim().toLowerCase())) return false;
    }
    fail(name, "must be a boolean");
}

function array<T = unknown>(value: unknown, options: HmpArrayValidationOptions<T> = {}): T[] {
    const name = options.name || "value";
    if (!Array.isArray(value)) fail(name, "must be an array");
    const minimum = options.minLength ?? 0;
    const maximum = options.maxLength ?? Infinity;
    if (value.length < minimum) fail(name, `must contain at least ${minimum} item(s)`);
    if (value.length > maximum) fail(name, `must contain at most ${maximum} item(s)`);
    const itemParser = options.item;
    if (typeof itemParser !== "function") return value as T[];
    return value.map((item, index) => itemParser(item, { name: `${name}[${index}]` }));
}

function object<T extends Record<string, unknown> = Record<string, unknown>>(
    value: unknown,
    options: { name?: string; plain?: boolean } = {},
): T {
    const name = options.name || "value";
    const accepted = options.plain === false ? isObject(value) : isPlainObject(value);
    if (!accepted) fail(name, options.plain === false ? "must be an object" : "must be a plain object");
    return value as T;
}

function oneOf<T>(value: T, allowed: Iterable<T>, options: { name?: string } = {}): T {
    const values = Array.from(allowed || []);
    if (!values.includes(value)) fail(options.name || "value", `must be one of: ${values.join(", ")}`);
    return value;
}

function optional<T>(parser: (value: unknown, options?: unknown) => T, defaultValue: T) {
    if (typeof parser !== "function") throw new TypeError("parser must be a function");
    return (value: unknown, options?: unknown): T => value === undefined || value === null ? defaultValue : parser(value, options);
}

function assert<T>(value: T, predicate: (value: T) => boolean, message = "failed validation"): T {
    if (typeof predicate !== "function") throw new TypeError("predicate must be a function");
    if (!predicate(value)) fail("value", message);
    return value;
}

export = Object.freeze({
    isObject,
    isPlainObject,
    string,
    number,
    boolean,
    array,
    object,
    oneOf,
    optional,
    assert,
});
// TypeScript source.
