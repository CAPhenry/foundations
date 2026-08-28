import type { HmpLogLevel, HmpLogger, HmpLoggerApi } from "../types";

const LEVELS: Readonly<Record<HmpLogLevel, number>> = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40, silent: Infinity });
type LogSink = Pick<Console, "debug" | "info" | "warn" | "error" | "log">;

function create(name: string, options: { level?: HmpLogLevel; sink?: LogSink; context?: Record<string, unknown> } = {}): HmpLogger {
    const label = String(name || "hmp");
    const sink = options.sink || console;
    let threshold = options.level === undefined ? LEVELS.info : LEVELS[options.level];
    const context = options.context && typeof options.context === "object" ? { ...options.context } : null;

    function write(level: Exclude<HmpLogLevel, "silent">, args: unknown[]): boolean {
        if (LEVELS[level] < threshold) return false;
        const method = typeof sink[level] === "function" ? sink[level] : sink.log;
        if (typeof method !== "function") return false;
        const prefix = `[${label}]`;
        if (context) method.call(sink, prefix, ...args, context);
        else method.call(sink, prefix, ...args);
        return true;
    }

    const api = {
        debug: (...args: unknown[]) => write("debug", args),
        info: (...args: unknown[]) => write("info", args),
        warn: (...args: unknown[]) => write("warn", args),
        error: (...args: unknown[]) => write("error", args),
        enabled: (level: HmpLogLevel) => (LEVELS[level] ?? Infinity) >= threshold,
        setLevel: (level: HmpLogLevel) => {
            if (!(level in LEVELS)) throw new TypeError(`unknown log level '${level}'`);
            threshold = LEVELS[level];
        },
        child: (child: string, childContext?: Record<string, unknown>) => create(`${label}:${child}`, {
            sink,
            level: (Object.keys(LEVELS) as HmpLogLevel[]).find((key) => LEVELS[key] === threshold) || "info",
            context: { ...(context || {}), ...(childContext || {}) },
        }),
    };
    return Object.freeze(api);
}

export = Object.freeze({ create, levels: LEVELS }) satisfies HmpLoggerApi;
// TypeScript source.
