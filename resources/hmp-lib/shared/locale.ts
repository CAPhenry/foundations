const MISSING = Symbol("missing");
type Catalog = Record<string, unknown>;
type MissingHandler = string | ((key: string, locale: string) => string);

function lookup(root: unknown, key: string): unknown | typeof MISSING {
    let value = root;
    for (const part of String(key).split(".")) {
        if (!value || typeof value !== "object" || !Object.prototype.hasOwnProperty.call(value, part)) return MISSING;
        value = (value as Record<string, unknown>)[part];
    }
    return value;
}

function interpolate(value: unknown, params?: Record<string, unknown>): string {
    if (!params || typeof params !== "object") return String(value);
    return String(value).replace(/\{([A-Za-z0-9_.-]+)\}/g, (match, key) =>
        Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match);
}

function create(
    dictionaries: Record<string, Catalog> = {},
    options: { locale?: string; fallback?: string; missing?: MissingHandler } = {},
) {
    const catalogs = new Map(Object.entries(dictionaries));
    let current = String(options.locale || "en");
    const fallback = String(options.fallback || "en");
    const missing = options.missing;

    function resolve(key: string, locale: string): unknown | typeof MISSING {
        const primary = lookup(catalogs.get(locale), key);
        if (primary !== MISSING) return primary;
        if (locale !== fallback) {
            const secondary = lookup(catalogs.get(fallback), key);
            if (secondary !== MISSING) return secondary;
        }
        return MISSING;
    }

    function t(key: string, params?: Record<string, unknown>, localeOverride?: string): string {
        const locale = String(localeOverride || current);
        const value = resolve(key, locale);
        if (value !== MISSING) return interpolate(value, params);
        if (typeof missing === "function") return String(missing(key, locale));
        if (missing !== undefined) return String(missing);
        return String(key);
    }

    function has(key: string, localeOverride?: string): boolean {
        return resolve(key, String(localeOverride || current)) !== MISSING;
    }

    function add(locale: string, messages: Catalog): void {
        if (!locale || !messages || typeof messages !== "object") throw new TypeError("locale and messages are required");
        catalogs.set(String(locale), messages);
    }

    function setLocale(locale: string): string {
        if (!locale) throw new TypeError("locale must be a non-empty string");
        current = String(locale);
        return current;
    }

    return Object.freeze({
        t,
        has,
        add,
        setLocale,
        getLocale: () => current,
        available: () => [...catalogs.keys()],
    });
}

export = Object.freeze({ create });
// TypeScript source.
