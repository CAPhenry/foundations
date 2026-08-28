import type { HmpEmoteChannel, HmpEmoteKind } from "../types";
import type { Database, EmoteRepository, PersistedAlias } from "./internal";

interface AliasRow {
    alias_name: string;
    asset_path: string | null;
    emote_kind: HmpEmoteKind;
    ability_channel: HmpEmoteChannel;
    hidden: number | boolean;
    updated_by_account_id: number | string | null;
    updated_at: string | Date;
}

function mapRow(row: AliasRow): PersistedAlias {
    return {
        name: row.alias_name,
        path: row.asset_path || "",
        kind: row.emote_kind === "ability" ? "ability" : "pose",
        channel: row.ability_channel === "PartialBody" ? "PartialBody" : "FullBody",
        source: "database",
        hidden: Boolean(row.hidden),
        updatedByAccountId: row.updated_by_account_id === null ? null : Number(row.updated_by_account_id),
        updatedAt: row.updated_at,
    };
}

function createRepository(database: Database): EmoteRepository {
    return Object.freeze({
        async start(migrations: Parameters<EmoteRepository["start"]>[0]) {
            if (typeof database.ready === "function" && !await database.ready()) throw new Error("hmp-mysql is not ready");
            await database.migrate("hmp-emotes", migrations);
        },
        async list() {
            const rows = await database.query<AliasRow[]>("SELECT * FROM hmp_emote_aliases ORDER BY alias_name");
            return rows.map(mapRow);
        },
        async put(record: Parameters<EmoteRepository["put"]>[0]) {
            await database.update(
                `INSERT INTO hmp_emote_aliases
                    (alias_name, asset_path, emote_kind, ability_channel, hidden, updated_by_account_id)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE asset_path = VALUES(asset_path), emote_kind = VALUES(emote_kind),
                    ability_channel = VALUES(ability_channel), hidden = VALUES(hidden),
                    updated_by_account_id = VALUES(updated_by_account_id), updated_at = CURRENT_TIMESTAMP`,
                [record.name, record.path, record.kind, record.channel, record.hidden, record.actorAccountId],
            );
        },
    });
}

export = { createRepository, mapRow };
