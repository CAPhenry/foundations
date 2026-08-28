import type { HmpPvpClient } from "../types";

let lethal = false;
let playerIds: number[] = [];

function restore(): boolean {
    try {
        Pvp.setTargetable(null);
        Pvp.resetTeam();

        if (lethal) {
            for (const playerId of playerIds) {
                Pvp.setTargetable(playerId);
                Pvp.setTeam("Enemy", playerId);
            }
        }
        return true;
    } catch (_) {
        return false;
    }
}

function apply(raw: unknown): void {
    let payload: Record<string, unknown> = {};
    if (typeof raw === "string") {
        try {
            payload = JSON.parse(raw) as Record<string, unknown>;
        } catch (_) {
            payload = {};
        }
    } else if (raw && typeof raw === "object") {
        payload = raw as Record<string, unknown>;
    }

    lethal = payload.enabled === true;
    playerIds = Array.isArray(payload.playerIds)
        ? [...new Set(
            payload.playerIds
                .map(Number)
                .filter((id) => Number.isSafeInteger(id) && id > 0),
        )]
        : [];
    restore();
}

const client: HmpPvpClient = Object.freeze({
    mode: Object.freeze({
        isLethal: () => lethal,
        restore,
    }),
});

Exports.register("mode", client.mode);
Events.on("hmp-pvp:mode", apply);
Events.on("resourceStop", (name?: string) => {
    if (!name || name === "hmp-pvp") {
        lethal = false;
        playerIds = [];
        restore();
    }
});
