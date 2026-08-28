import type {
    HmpActivityDefinition, HmpActivityPlayer, HmpActivityRoleDefinition, HmpActivityTeamDefinition,
    HmpActivityVisibility,
} from "../types";
import type { ActivityConfig, NormalizedDefinition } from "../server/internal";

function text(value: unknown, label: string, maximum: number, required = true): string {
    const result = String(value ?? "").trim();
    if ((required && !result) || result.length > maximum) throw new TypeError(`${label} must be ${required ? "a non-empty " : "a "}string up to ${maximum} characters`);
    return result;
}

function id(value: unknown, label: string): string {
    const result = text(value, label, 100).toLowerCase();
    if (!/^[a-z0-9][a-z0-9:_-]*$/.test(result)) throw new TypeError(`${label} may contain only letters, numbers, colons, underscores, and hyphens`);
    return result;
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
    const result = Number(value);
    if (!Number.isSafeInteger(result) || result < minimum || result > maximum) throw new TypeError(`${label} must be an integer from ${minimum} to ${maximum}`);
    return result;
}

function role(raw: unknown, label: string, teamMaximum: number): HmpActivityRoleDefinition {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError(`${label} must be an object`);
    const value = raw as Record<string, unknown>;
    const maximum = integer(value.max, `${label}.max`, 1, teamMaximum);
    const minimum = value.min === undefined ? 0 : integer(value.min, `${label}.min`, 0, maximum);
    return {
        id: id(value.id, `${label}.id`), label: text(value.label, `${label}.label`, 80),
        description: text(value.description, `${label}.description`, 300, false) || undefined,
        min: minimum, max: maximum,
    };
}

function unique<T extends { id: string }>(entries: T[], label: string): T[] {
    const ids = new Set<string>();
    for (const entry of entries) {
        if (ids.has(entry.id)) throw new TypeError(`${label} contains duplicate id '${entry.id}'`);
        ids.add(entry.id);
    }
    return entries;
}

export function normalizeDefinition<P extends HmpActivityPlayer>(raw: HmpActivityDefinition<P>, config: ActivityConfig): NormalizedDefinition<P> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("activity definition must be an object");
    const minimumPlayers = integer(raw.minimumPlayers, "activity minimumPlayers", 1, 64);
    const maximumPlayers = integer(raw.maximumPlayers, "activity maximumPlayers", minimumPlayers, 64);
    if (raw.roles?.length && raw.teams?.length) throw new TypeError("activity roles and teams are mutually exclusive; put roles inside each team");
    const roles = unique((raw.roles || []).map((entry, index) => role(entry, `activity roles[${index}]`, maximumPlayers)), "activity roles");
    const teams: HmpActivityTeamDefinition[] = unique((raw.teams || []).map((entry, index) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new TypeError(`activity teams[${index}] must be an object`);
        const maximum = integer(entry.max, `activity teams[${index}].max`, 1, maximumPlayers);
        const minimum = entry.min === undefined ? 0 : integer(entry.min, `activity teams[${index}].min`, 0, maximum);
        const nested = unique((entry.roles || []).map((candidate, roleIndex) => role(candidate, `activity teams[${index}].roles[${roleIndex}]`, maximum)), `activity team '${entry.id}' roles`);
        if (nested.reduce((sum, candidate) => sum + (candidate.min || 0), 0) > maximum) throw new TypeError(`activity team '${entry.id}' role minimums exceed its maximum`);
        return { id: id(entry.id, `activity teams[${index}].id`), label: text(entry.label, `activity teams[${index}].label`, 80), min: minimum, max: maximum, roles: nested };
    }), "activity teams");
    if (roles.reduce((sum, entry) => sum + (entry.min || 0), 0) > maximumPlayers) throw new TypeError("activity role minimums exceed maximumPlayers");
    if (teams.reduce((sum, entry) => sum + (entry.min || 0), 0) > maximumPlayers) throw new TypeError("activity team minimums exceed maximumPlayers");
    const visibility = raw.defaultVisibility || "public";
    if (!["public", "unlisted", "private"].includes(visibility)) throw new TypeError("activity defaultVisibility is invalid");
    const scope = raw.scope || "global";
    if (!["global", "area", "region", "virtualWorld", "areaAndVirtualWorld"].includes(scope)) throw new TypeError("activity scope is invalid");
    const disconnectPolicy = raw.disconnectPolicy || "cancel";
    if (disconnectPolicy !== "cancel" && disconnectPolicy !== "remove") throw new TypeError("activity disconnectPolicy must be cancel or remove");
    return {
        ...raw,
        id: id(raw.id, "activity id"), resource: id(raw.resource, "activity resource"),
        label: text(raw.label, "activity label", 100), description: text(raw.description, "activity description", 500, false),
        minimumPlayers, maximumPlayers, roles, teams,
        requireReady: raw.requireReady !== false,
        requiresCharacter: raw.requiresCharacter !== false,
        exclusive: raw.exclusive !== false,
        disconnectPolicy,
        defaultVisibility: visibility as HmpActivityVisibility,
        scope,
        lobbyTtlSeconds: raw.lobbyTtlSeconds === undefined ? config.defaultLobbyTtlSeconds : integer(raw.lobbyTtlSeconds, "activity lobbyTtlSeconds", 30, config.maximumLobbyTtlSeconds),
    };
}

export function cleanText(value: unknown, label: string, maximum: number): string { return text(value, label, maximum, false); }
export function cleanId(value: unknown, label: string): string { return id(value, label); }
export function boundedInteger(value: unknown, label: string, minimum: number, maximum: number): number { return integer(value, label, minimum, maximum); }
