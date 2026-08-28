import type { HmpMySQLMigration, HmpMySQLTransaction } from "../../hmp-mysql/types";
import type { HmpEmployment, HmpJobAuditEntry } from "../types";
import type { AuditDraft, Database, EmploymentMutation, JobsRepository } from "./internal";

interface EmploymentRow {
    character_id: number | string;
    character_name: string;
    job_id: string;
    grade: number | string;
    status: HmpEmployment["status"];
    is_active: number | string | boolean;
    hired_by: number | string | null;
    hired_at: string | Date;
    updated_at: string | Date;
    terminated_at: string | Date | null;
    last_paid_at: string | Date | null;
}

interface AuditRow {
    id: number | string;
    character_id: number | string;
    job_id: string;
    action: string;
    actor_character_id: number | string | null;
    from_grade: number | string | null;
    to_grade: number | string | null;
    source_resource: string;
    reason_text: string;
    metadata_json: string | null;
    created_at: string | Date;
}

const EMPLOYMENT_SELECT = `SELECT employment.*, character_row.name AS character_name
    FROM hmp_job_employments employment
    JOIN hmp_characters character_row ON character_row.id = employment.character_id`;

function safeInteger(value: number | string, name: string): number {
    const numeric = Number(value);
    if (!Number.isSafeInteger(numeric) || numeric < 0) throw new Error(`${name} exceeds the JavaScript safe integer range`);
    return numeric;
}

function metadata(raw: string | null): Record<string, unknown> {
    if (!raw) return {};
    try {
        const parsed: unknown = JSON.parse(raw);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch { return {}; }
}

function mapEmployment(row: EmploymentRow): HmpEmployment {
    return {
        characterId: safeInteger(row.character_id, "employment character id"),
        characterName: row.character_name,
        jobId: row.job_id,
        grade: safeInteger(row.grade, "employment grade"),
        status: row.status,
        active: Boolean(Number(row.is_active)),
        hiredBy: row.hired_by === null ? null : safeInteger(row.hired_by, "employment hirer id"),
        hiredAt: row.hired_at,
        updatedAt: row.updated_at,
        terminatedAt: row.terminated_at,
        lastPaidAt: row.last_paid_at,
    };
}

function mapAudit(row: AuditRow): HmpJobAuditEntry {
    return {
        id: safeInteger(row.id, "job audit id"),
        characterId: safeInteger(row.character_id, "job audit character id"),
        jobId: row.job_id,
        action: row.action,
        actorCharacterId: row.actor_character_id === null ? null : safeInteger(row.actor_character_id, "job audit actor id"),
        fromGrade: row.from_grade === null ? null : safeInteger(row.from_grade, "job audit previous grade"),
        toGrade: row.to_grade === null ? null : safeInteger(row.to_grade, "job audit next grade"),
        resource: row.source_resource,
        reason: row.reason_text || "",
        metadata: metadata(row.metadata_json),
        createdAt: row.created_at,
    };
}

function createRepository(database: Database): JobsRepository {
    if (!database || typeof database.transaction !== "function") throw new TypeError("database API is required");

    async function getWith(tx: HmpMySQLTransaction, characterId: number, jobId: string, lock = false): Promise<HmpEmployment | null> {
        const row = await tx.single<EmploymentRow>(`${EMPLOYMENT_SELECT} WHERE employment.character_id = ? AND employment.job_id = ?${lock ? " FOR UPDATE" : ""}`, [characterId, jobId]);
        return row ? mapEmployment(row) : null;
    }

    async function insertAudit(tx: HmpMySQLTransaction, draft: AuditDraft): Promise<HmpJobAuditEntry> {
        const result = await tx.insert(
            `INSERT INTO hmp_job_audit
                (character_id, job_id, action, actor_character_id, from_grade, to_grade, source_resource, reason_text, metadata_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [draft.characterId, draft.jobId, draft.action, draft.actorCharacterId ?? null, draft.fromGrade ?? null, draft.toGrade ?? null, draft.resource || "hmp-jobs", (draft.reason || "").slice(0, 191), JSON.stringify(draft.metadata || {})],
        );
        const row = await tx.single<AuditRow>("SELECT * FROM hmp_job_audit WHERE id = ?", [result]);
        if (!row) throw new Error("job audit row could not be created");
        return mapAudit(row);
    }

    async function get(characterId: number, jobId: string): Promise<HmpEmployment | null> {
        return getWith(database, characterId, jobId);
    }

    async function list(characterId: number): Promise<HmpEmployment[]> {
        const rows = await database.query<EmploymentRow[]>(`${EMPLOYMENT_SELECT} WHERE employment.character_id = ? ORDER BY employment.status, employment.is_active DESC, employment.job_id`, [characterId]);
        return rows.map(mapEmployment);
    }

    async function employees(jobId: string, includeTerminated = false): Promise<HmpEmployment[]> {
        const rows = await database.query<EmploymentRow[]>(
            `${EMPLOYMENT_SELECT} WHERE employment.job_id = ?${includeTerminated ? "" : " AND employment.status = 'employed'"} ORDER BY employment.status, employment.grade DESC, character_row.name`,
            [jobId],
        );
        return rows.map(mapEmployment);
    }

    async function hire(mutation: EmploymentMutation): Promise<HmpEmployment> {
        return database.transaction(async (tx) => {
            const existing = await getWith(tx, mutation.characterId, mutation.jobId, true);
            if (existing?.status === "employed") throw new Error(`${existing.characterName} is already employed by this job`);
            const activeCount = Number(await tx.scalar(
                "SELECT COUNT(*) FROM hmp_job_employments WHERE character_id = ? AND status = 'employed' AND is_active = 1 FOR UPDATE",
                [mutation.characterId],
            ) || 0);
            await tx.update(
                `INSERT INTO hmp_job_employments
                    (character_id, job_id, grade, status, is_active, hired_by, hired_at, terminated_at, last_paid_at)
                 VALUES (?, ?, ?, 'employed', ?, ?, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP)
                 ON DUPLICATE KEY UPDATE grade = VALUES(grade), status = 'employed', is_active = VALUES(is_active), hired_by = VALUES(hired_by), hired_at = CURRENT_TIMESTAMP, terminated_at = NULL, last_paid_at = CURRENT_TIMESTAMP`,
                [mutation.characterId, mutation.jobId, mutation.grade!, activeCount === 0 ? 1 : 0, mutation.actorCharacterId],
            );
            await insertAudit(tx, { ...mutation, action: "hired", fromGrade: existing?.grade ?? null, toGrade: mutation.grade! });
            return (await getWith(tx, mutation.characterId, mutation.jobId, true))!;
        });
    }

    async function fire(mutation: EmploymentMutation): Promise<HmpEmployment> {
        return database.transaction(async (tx) => {
            const existing = await getWith(tx, mutation.characterId, mutation.jobId, true);
            if (!existing || existing.status !== "employed") throw new Error("active employment was not found");
            await tx.update("UPDATE hmp_job_employments SET status = 'terminated', is_active = 0, terminated_at = CURRENT_TIMESTAMP WHERE character_id = ? AND job_id = ?", [mutation.characterId, mutation.jobId]);
            await insertAudit(tx, { ...mutation, action: "fired", fromGrade: existing.grade, toGrade: null });
            return (await getWith(tx, mutation.characterId, mutation.jobId, true))!;
        });
    }

    async function setGrade(mutation: EmploymentMutation): Promise<HmpEmployment> {
        return database.transaction(async (tx) => {
            const existing = await getWith(tx, mutation.characterId, mutation.jobId, true);
            if (!existing || existing.status !== "employed") throw new Error("active employment was not found");
            await tx.update("UPDATE hmp_job_employments SET grade = ? WHERE character_id = ? AND job_id = ?", [mutation.grade!, mutation.characterId, mutation.jobId]);
            await insertAudit(tx, { ...mutation, action: "grade", fromGrade: existing.grade, toGrade: mutation.grade! });
            return (await getWith(tx, mutation.characterId, mutation.jobId, true))!;
        });
    }

    async function setActive(mutation: EmploymentMutation): Promise<HmpEmployment> {
        return database.transaction(async (tx) => {
            const existing = await getWith(tx, mutation.characterId, mutation.jobId, true);
            if (!existing || existing.status !== "employed") throw new Error("active employment was not found");
            await tx.update("UPDATE hmp_job_employments SET is_active = 0 WHERE character_id = ? AND status = 'employed' AND is_active = 1", [mutation.characterId]);
            await tx.update("UPDATE hmp_job_employments SET is_active = 1 WHERE character_id = ? AND job_id = ? AND status = 'employed'", [mutation.characterId, mutation.jobId]);
            await insertAudit(tx, { ...mutation, action: "active", fromGrade: existing.grade, toGrade: existing.grade });
            return (await getWith(tx, mutation.characterId, mutation.jobId, true))!;
        });
    }

    async function markPaid(characterId: number, jobId: string, resource: string, paymentMetadata: Record<string, unknown> = {}): Promise<HmpEmployment> {
        return database.transaction(async (tx) => {
            const existing = await getWith(tx, characterId, jobId, true);
            if (!existing || existing.status !== "employed") throw new Error("active employment was not found");
            await tx.update("UPDATE hmp_job_employments SET last_paid_at = CURRENT_TIMESTAMP WHERE character_id = ? AND job_id = ?", [characterId, jobId]);
            await insertAudit(tx, { characterId, jobId, action: "paid", fromGrade: existing.grade, toGrade: existing.grade, resource, metadata: paymentMetadata });
            return (await getWith(tx, characterId, jobId, true))!;
        });
    }

    async function audit(draft: AuditDraft): Promise<HmpJobAuditEntry> {
        return database.transaction((tx) => insertAudit(tx, draft));
    }

    async function history(characterId: number, jobId: string | undefined, limit: number): Promise<HmpJobAuditEntry[]> {
        const rows = await database.query<AuditRow[]>(
            `SELECT * FROM hmp_job_audit WHERE character_id = ?${jobId ? " AND job_id = ?" : ""} ORDER BY id DESC LIMIT ${Math.max(1, Math.min(200, Math.trunc(limit)))}`,
            jobId ? [characterId, jobId] : [characterId],
        );
        return rows.map(mapAudit);
    }

    return Object.freeze({
        migrate: (migrations: HmpMySQLMigration[]) => database.migrate("hmp-jobs", migrations),
        get, list, employees, hire, fire, setGrade, setActive, markPaid, audit, history,
    });
}

export = { createRepository, mapEmployment, mapAudit };
