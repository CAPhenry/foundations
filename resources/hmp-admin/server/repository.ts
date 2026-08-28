import type { HmpAdminAuditEntry, HmpAdminBan, HmpAdminWarning } from "../types";
import type { AdminRepository, AuditStart, BanInput, Database } from "./internal";

interface AuditRow {
    id: number | string; actor_account_id: number | string | null; actor_character_id: number | string | null; actor_player_id: number | string | null;
    action: string; target_account_id: number | string | null; target_character_id: number | string | null; target_player_id: number | string | null;
    reason: string; metadata_json: unknown; status: "pending" | "completed" | "failed"; error: string; created_at: string | Date; completed_at: string | Date | null;
}
interface WarningRow { id: number | string; account_id: number | string; actor_account_id: number | string | null; reason: string; created_at: string | Date }
interface BanRow {
    id: number | string; account_id: number | string; provider: string; subject: string; trust: string; actor_account_id: number | string | null;
    reason: string; expires_at: string | Date | null; created_at: string | Date; revoked_at: string | Date | null;
}

const numberOrNull = (value: number | string | null): number | null => value === null ? null : Number(value);
function json(value: unknown): Record<string, unknown> {
    if (value === null || value === undefined || value === "") return {};
    try { return JSON.parse(String(value)) as Record<string, unknown>; }
    catch (_) { return {}; }
}
function mapAudit(row: AuditRow): HmpAdminAuditEntry {
    return {
        id: Number(row.id), actorAccountId: numberOrNull(row.actor_account_id), actorCharacterId: numberOrNull(row.actor_character_id),
        actorPlayerId: numberOrNull(row.actor_player_id), action: row.action, targetAccountId: numberOrNull(row.target_account_id),
        targetCharacterId: numberOrNull(row.target_character_id), targetPlayerId: numberOrNull(row.target_player_id), reason: row.reason,
        metadata: json(row.metadata_json), status: row.status, error: row.error, createdAt: row.created_at, completedAt: row.completed_at,
    };
}
function mapWarning(row: WarningRow): HmpAdminWarning {
    return { id: Number(row.id), accountId: Number(row.account_id), actorAccountId: numberOrNull(row.actor_account_id), reason: row.reason, createdAt: row.created_at };
}
function mapBan(row: BanRow): HmpAdminBan {
    return {
        id: Number(row.id), accountId: Number(row.account_id), provider: row.provider, subject: row.subject, trust: row.trust,
        actorAccountId: numberOrNull(row.actor_account_id), reason: row.reason, expiresAt: row.expires_at, createdAt: row.created_at, revokedAt: row.revoked_at,
    };
}

function createRepository(database: Database): AdminRepository {
    if (!database || typeof database.migrate !== "function") throw new TypeError("database API is required");

    async function start(migrations: Parameters<AdminRepository["start"]>[0]): Promise<void> {
        if (typeof database.ready === "function" && !await database.ready()) throw new Error("hmp-mysql is not ready");
        await database.migrate("hmp-admin", migrations);
    }

    async function beginAudit(input: AuditStart): Promise<number> {
        return Number(await database.insert(
            `INSERT INTO hmp_admin_audit
                (actor_account_id, actor_character_id, actor_player_id, action, target_account_id, target_character_id, target_player_id, reason, metadata_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [input.actor?.account.id ?? null, input.actor?.character?.id ?? null, input.actor?.playerId ?? null, input.action,
                input.target?.account.id ?? null, input.target?.character?.id ?? null, input.target?.playerId ?? null,
                input.reason, JSON.stringify(input.metadata || {})],
        ));
    }

    async function finishAudit(id: number, status: "completed" | "failed", error = "", metadata?: Record<string, unknown>): Promise<void> {
        await database.update(
            "UPDATE hmp_admin_audit SET status = ?, error = ?, metadata_json = COALESCE(?, metadata_json), completed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'",
            [status, String(error).slice(0, 500), metadata ? JSON.stringify(metadata) : null, id],
        );
    }

    async function audit(limit: number, targetAccountId?: number): Promise<HmpAdminAuditEntry[]> {
        const bounded = Math.max(1, Math.min(200, Math.trunc(limit)));
        const rows = targetAccountId
            ? await database.query<AuditRow[]>(`SELECT * FROM hmp_admin_audit WHERE target_account_id = ? ORDER BY id DESC LIMIT ${bounded}`, [targetAccountId])
            : await database.query<AuditRow[]>(`SELECT * FROM hmp_admin_audit ORDER BY id DESC LIMIT ${bounded}`);
        return rows.map(mapAudit);
    }

    async function addWarning(accountId: number, actorAccountId: number | null, reason: string): Promise<HmpAdminWarning> {
        const id = await database.insert("INSERT INTO hmp_admin_warnings (account_id, actor_account_id, reason) VALUES (?, ?, ?)", [accountId, actorAccountId, reason]);
        const row = await database.single<WarningRow>("SELECT * FROM hmp_admin_warnings WHERE id = ?", [id]);
        if (!row) throw new Error("admin warning was not created");
        return mapWarning(row);
    }

    async function warnings(accountId: number, limit: number): Promise<HmpAdminWarning[]> {
        const bounded = Math.max(1, Math.min(200, Math.trunc(limit)));
        return (await database.query<WarningRow[]>(`SELECT * FROM hmp_admin_warnings WHERE account_id = ? ORDER BY id DESC LIMIT ${bounded}`, [accountId])).map(mapWarning);
    }

    async function addBan(input: BanInput): Promise<HmpAdminBan> {
        const id = await database.insert(
            "INSERT INTO hmp_admin_bans (account_id, provider, subject, trust, actor_account_id, reason, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [input.accountId, input.provider, input.subject, input.trust, input.actorAccountId, input.reason, input.expiresAt],
        );
        const row = await database.single<BanRow>("SELECT * FROM hmp_admin_bans WHERE id = ?", [id]);
        if (!row) throw new Error("admin ban was not created");
        return mapBan(row);
    }

    async function activeBan(session: Parameters<AdminRepository["activeBan"]>[0]): Promise<HmpAdminBan | null> {
        const row = await database.single<BanRow>(
            `SELECT * FROM hmp_admin_bans
             WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
               AND (account_id = ? OR (provider = ? AND subject = ?))
             ORDER BY id DESC LIMIT 1`,
            [session.account.id, session.principal.provider, session.principal.subject],
        );
        return row ? mapBan(row) : null;
    }

    async function revokeBan(id: number, actorAccountId: number | null, reason: string): Promise<boolean> {
        return (await database.update(
            "UPDATE hmp_admin_bans SET revoked_at = CURRENT_TIMESTAMP, revoked_by_account_id = ?, revoke_reason = ? WHERE id = ? AND revoked_at IS NULL",
            [actorAccountId, reason, id],
        )) > 0;
    }

    async function bans(limit: number): Promise<HmpAdminBan[]> {
        const bounded = Math.max(1, Math.min(200, Math.trunc(limit)));
        return (await database.query<BanRow[]>(`SELECT * FROM hmp_admin_bans ORDER BY id DESC LIMIT ${bounded}`)).map(mapBan);
    }

    return Object.freeze({ start, beginAudit, finishAudit, audit, addWarning, warnings, addBan, activeBan, revokeBan, bans });
}

export = { createRepository };
