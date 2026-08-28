import type { HmpAudioOwner, HmpAudioPlayOptions, HmpAudioPlayer, HmpAudioPosition } from "../types";

const RESOURCE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const ALIAS = /^[a-z0-9][a-z0-9_.-]{0,63}$/i;

function cleanText(value: unknown, label: string, maximum = 200): string {
    const result = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
    if (!result || result.length > maximum) throw new TypeError(`${label} must be a non-empty string up to ${maximum} characters`);
    return result;
}

function owner(raw: HmpAudioOwner): Required<HmpAudioOwner> & { key: string } {
    if (!raw || typeof raw !== "object") throw new TypeError("audio owner is required");
    const resource = cleanText(raw.resource, "audio owner resource", 64).toLowerCase();
    const id = cleanText(raw.id ?? "default", "audio owner id", 80).toLowerCase();
    if (!RESOURCE.test(resource)) throw new TypeError("audio owner resource contains unsupported characters");
    return { resource, id, key: `${resource}:${id}` };
}

function event(value: unknown): string {
    return cleanText(value, "Wwise event", 200);
}

function bank(value: unknown): string {
    return cleanText(value, "soundbank", 160);
}

function alias(value: unknown): string {
    const result = cleanText(value, "audio alias", 64).toLowerCase();
    if (!ALIAS.test(result)) throw new TypeError(`audio alias '${result}' contains unsupported characters`);
    return result;
}

function position(raw: HmpAudioPosition): HmpAudioPosition {
    if (!raw || typeof raw !== "object") throw new TypeError("audio position is required");
    const value = { x: Number(raw.x), y: Number(raw.y), z: Number(raw.z) };
    if (![value.x, value.y, value.z].every(Number.isFinite)) throw new TypeError("audio position must contain finite x, y, and z values");
    return value;
}

function player<P extends HmpAudioPlayer>(raw: P): P {
    const id = Number(raw?.id);
    if (!Number.isSafeInteger(id) || id < 0 || raw?.connected === false) throw new TypeError("a connected player is required");
    return raw;
}

function options(raw: HmpAudioPlayOptions | undefined, positional: boolean): HmpAudioPlayOptions {
    if (raw !== undefined && (!raw || typeof raw !== "object" || Array.isArray(raw))) throw new TypeError("audio options must be an object");
    const value = raw || {};
    const normalized: HmpAudioPlayOptions = {};
    if (value.range !== undefined) {
        if (!positional) throw new TypeError("range is only valid for positional or player-attached playback");
        const range = Number(value.range);
        if (!Number.isFinite(range) || range < 0 || range > 10_000_000) throw new RangeError("audio range must be between 0 and 10000000 centimetres");
        normalized.range = range;
    }
    if (value.duration !== undefined) {
        const duration = Number(value.duration);
        if (!Number.isFinite(duration) || duration <= 0 || duration > 86_400) throw new RangeError("audio duration must be greater than 0 and at most 86400 seconds");
        normalized.duration = duration;
    }
    if (value.bank !== undefined) normalized.bank = bank(value.bank);
    if (value.stopEvent !== undefined) normalized.stopEvent = event(value.stopEvent);
    if (value.autoStop !== undefined) normalized.autoStop = Boolean(value.autoStop);
    if (value.held !== undefined) normalized.held = Boolean(value.held);
    return normalized;
}

function aliases(raw: Readonly<Record<string, string>>): Record<string, string> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("audio aliases must be an object");
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) normalized[alias(key)] = event(value);
    if (!Object.keys(normalized).length) throw new TypeError("audio aliases cannot be empty");
    return normalized;
}

export = { owner, event, bank, alias, position, player, options, aliases };
