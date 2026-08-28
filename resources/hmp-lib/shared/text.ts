const DEFAULT_MAX_LENGTH = 256;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;

interface CleanOptions {
    maxLength?: number;
    multiline?: boolean;
    maxLines?: number;
}

function maxLength(value: unknown, fallback = DEFAULT_MAX_LENGTH): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function printable(character: string): string {
    if (character === "\n") return "\n";
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? " " : character;
}

function clean(value: unknown, options: number | CleanOptions = {}): string {
    if (typeof options === "number") options = { maxLength: options };
    const limit = maxLength(options.maxLength);
    const multiline = options.multiline === true;
    const linesLimit = maxLength(options.maxLines, multiline ? 20 : 1);

    let output = Array.from(String(value ?? "").replace(/\r\n?/g, "\n"), printable).join("");
    if (!multiline) {
        output = output.replace(/\s+/g, " ").trim();
    } else {
        output = output
            .replace(/[^\S\n]+/g, " ")
            .replace(/ *\n */g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
        const lines = output.split("\n");
        if (lines.length > linesLimit) output = lines.slice(0, linesLimit).join("\n");
    }
    return output.slice(0, limit);
}

function slug(value: unknown, limit = 64): string {
    return String(value ?? "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, maxLength(limit, 64))
        .replace(/-+$/g, "");
}

function isId(value: unknown): value is string {
    return typeof value === "string" && ID_PATTERN.test(value);
}

function truncate(value: unknown, limit = DEFAULT_MAX_LENGTH, suffix = "…"): string {
    const text = String(value ?? "");
    const length = maxLength(limit);
    if (text.length <= length) return text;
    if (!length) return "";
    const ending = String(suffix ?? "").slice(0, length);
    return text.slice(0, Math.max(0, length - ending.length)) + ending;
}

export = Object.freeze({ clean, slug, isId, truncate });
// TypeScript source.
