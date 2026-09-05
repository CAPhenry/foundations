import loadoutsModule = require("./loadouts");
import type {
    HmpProvidedSpell,
    HmpResolvedProvidedSpell,
    HmpSpellProviderDefinition,
    HmpSpellProviderInfo,
} from "../types";

const { isModdedSpellPath, isNativeSpellName, normalizeSlotSpellId } = loadoutsModule;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const RESERVED = new Set(["native", "record"]);

function cleanId(raw: unknown, label: string): string {
    const value = String(raw || "").trim();
    if (!ID.test(value)) throw new TypeError(`${label} must be a stable identifier`);
    return value;
}

function normalizeProvidedSpell(raw: unknown): HmpProvidedSpell {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("provider spell must be an object");
    const value = raw as Record<string, unknown>;
    const id = cleanId(value.id, "provider spell id");
    const label = String(value.label || id).trim().slice(0, 100) || id;
    const icon = typeof value.icon === "string" && value.icon.trim() ? value.icon.trim().slice(0, 512) : undefined;
    if (value.kind === "record") {
        const recordPath = String(value.recordPath || "").trim();
        if (!isModdedSpellPath(recordPath)) throw new TypeError(`record spell '${id}' requires a plugin-rooted Package.Object path`);
        return { id, label, kind: "record", recordPath, ...(icon ? { icon } : {}) };
    }
    if (value.kind === "native") {
        const nativeName = String(value.nativeName || "").trim();
        if (!isNativeSpellName(nativeName)) throw new TypeError(`native spell '${id}' requires a native gameplay name`);
        return { id, label, kind: "native", nativeName, ...(icon ? { icon } : {}) };
    }
    throw new TypeError(`provider spell '${id}' kind must be record or native`);
}

function normalizeProvider(raw: HmpSpellProviderDefinition): HmpSpellProviderInfo {
    if (!raw || typeof raw !== "object") throw new TypeError("spell provider is required");
    const id = cleanId(raw.id, "provider id");
    if (RESERVED.has(id)) throw new TypeError(`provider id '${id}' is reserved`);
    const resource = cleanId(raw.resource, "provider resource");
    if (!Array.isArray(raw.spells) || !raw.spells.length) throw new TypeError(`provider '${id}' must define at least one spell`);
    const spells = raw.spells.map(normalizeProvidedSpell);
    if (new Set(spells.map((spell) => spell.id)).size !== spells.length) throw new TypeError(`provider '${id}' has duplicate spell ids`);
    return { id, resource, label: String(raw.label || id).trim().slice(0, 100) || id, spells };
}

function normalizeProviderList(raw: unknown): HmpSpellProviderInfo[] {
    if (!Array.isArray(raw)) return [];
    const providers: HmpSpellProviderInfo[] = [];
    for (const entry of raw) {
        try { providers.push(normalizeProvider(entry as HmpSpellProviderDefinition)); }
        catch (_) { /* A malformed remote provider is unavailable, never executable. */ }
    }
    return providers;
}

function resolveProvidedSpell(rawRef: unknown, providers: ReadonlyArray<HmpSpellProviderInfo>): HmpResolvedProvidedSpell | null {
    const ref = normalizeSlotSpellId(rawRef);
    if (!ref) return null;
    const split = ref.indexOf(":");
    const provider = ref.slice(0, split);
    const id = ref.slice(split + 1);
    if (provider === "native") return { provider, ref, id, label: id, kind: "native", nativeName: id };
    if (provider === "record") return { provider, ref, id, label: id.slice(id.lastIndexOf("/") + 1).split(".")[0], kind: "record", recordPath: id };
    const definition = providers.find((candidate) => candidate.id === provider);
    const spell = definition?.spells.find((candidate) => candidate.id === id);
    return spell ? { ...spell, provider, ref } : null;
}

export = { normalizeProvidedSpell, normalizeProvider, normalizeProviderList, resolveProvidedSpell };
