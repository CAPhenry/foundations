import type {
    HmpPlayerApi,
    HmpPlayerLike,
    HmpPlayerResolution,
    HmpPlayerResolutionReason,
} from "../types";

function createPlayerApi<P extends HmpPlayerLike>(getPlayers: () => P[]): HmpPlayerApi<P> {
    if (typeof getPlayers !== "function") throw new TypeError("getPlayers must be a function");

    function all(): P[] {
        try {
            const players = getPlayers();
            return Array.isArray(players) ? players.filter(Boolean) : [];
        } catch (_) {
            return [];
        }
    }

    function byId(id: number | string): P | null {
        const wanted = Number(id);
        if (!Number.isSafeInteger(wanted) || wanted < 0) return null;
        return all().find((player) => Number(player.id) === wanted) || null;
    }

    function result(player: P | null, reason: HmpPlayerResolutionReason, candidates: P[] = []): HmpPlayerResolution<P> {
        return { ok: Boolean(player), player: player || null, reason, candidates };
    }

    function resolve(
        query: string | number | P,
        self: P | null = null,
        options: { allowSelf?: boolean; caseSensitive?: boolean } = {},
    ): HmpPlayerResolution<P> {
        if (query && typeof query === "object" && query.id !== undefined) {
            const player = byId(query.id);
            return player ? result(player, "found") : result(null, "not-found");
        }

        const input = typeof query === "number" ? `#${query}` : String(query ?? "").trim();
        if (!input) return result(null, "empty");
        if (options.allowSelf !== false && input.toLowerCase() === "me") {
            return self ? result(self, "found") : result(null, "self-unavailable");
        }

        if (input.startsWith("#")) {
            const player = byId(input.slice(1));
            return player ? result(player, "found") : result(null, "not-found");
        }

        const normalize = options.caseSensitive === true
            ? (value: unknown) => String(value)
            : (value: unknown) => String(value).toLocaleLowerCase("en-US");
        const wanted = normalize(input);
        const candidates = all().filter((player) => normalize(player.nickname ?? "") === wanted);
        if (candidates.length === 1) return result(candidates[0] ?? null, "found", candidates);
        if (candidates.length > 1) return result(null, "ambiguous", candidates);
        return result(null, "not-found");
    }

    function find(
        query: string | number | P,
        self: P | null = null,
        options: { allowSelf?: boolean; caseSensitive?: boolean } = {},
    ): P | null {
        return resolve(query, self, options).player;
    }

    function format(player: P | null): string {
        if (!player) return "unknown player";
        return `${player.nickname || "unnamed"} (#${player.id})`;
    }

    return Object.freeze({ all, byId, resolve, find, format });
}

export = { createPlayerApi };
// TypeScript source.
