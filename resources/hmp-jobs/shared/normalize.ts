import type { HmpBankPermission } from "../../hmp-banking/types";
import type { HmpJobDefinition, HmpJobGrade, HmpJobMutationOptions, HmpJobPlayer } from "../types";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
const BANK_PERMISSIONS = new Set<HmpBankPermission>(["view", "deposit", "withdraw", "transfer", "manage"]);

function clean(value: unknown, maximum = 120): string {
    return Array.from(String(value ?? ""), (character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127 ? " " : character;
    }).join("").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function id(value: unknown, name: string): string {
    const normalized = String(value ?? "").trim();
    if (!IDENTIFIER.test(normalized)) throw new TypeError(`${name} is invalid`);
    return normalized;
}

function integer(value: unknown, fallback: number, minimum: number, maximum: number): number {
    const numeric = Number(value);
    return Math.trunc(Math.min(maximum, Math.max(minimum, Number.isFinite(numeric) ? numeric : fallback)));
}

function positiveId(value: unknown, name: string): number {
    const numeric = Number(value);
    if (!Number.isSafeInteger(numeric) || numeric < 1) throw new TypeError(`${name} is invalid`);
    return numeric;
}

function normalizeGrade(raw: HmpJobGrade, seen: Set<number>): HmpJobGrade {
    if (!raw || typeof raw !== "object") throw new TypeError("job grade is required");
    const level = integer(raw.level, 0, 0, 1000);
    if (seen.has(level)) throw new TypeError(`job grade '${level}' is duplicated`);
    seen.add(level);
    const permissions = [...new Set((raw.permissions || []).slice(0, 64).map((permission) => id(permission, "job permission")))];
    const bankPermissions = [...new Set((raw.bankPermissions || []).slice(0, 5).map((permission) => {
        if (!BANK_PERMISSIONS.has(permission)) throw new TypeError(`bank permission '${String(permission)}' is invalid`);
        return permission;
    }))];
    return Object.freeze({
        level,
        label: clean(raw.label, 60) || `Grade ${level}`,
        salary: integer(raw.salary, 0, 0, Number.MAX_SAFE_INTEGER),
        permissions: Object.freeze(permissions),
        bankPermissions: Object.freeze(bankPermissions),
    });
}

function normalizeJob<P = HmpJobPlayer>(raw: HmpJobDefinition<P>): HmpJobDefinition<P> {
    if (!raw || typeof raw !== "object") throw new TypeError("job definition is required");
    const jobId = id(raw.id, "job id");
    if (jobId.length > 38) throw new TypeError("job id is too long for its duty interaction ids");
    const resource = id(raw.resource, "job resource");
    const seenGrades = new Set<number>();
    const grades = (raw.grades || []).slice(0, 32).map((grade) => normalizeGrade(grade, seenGrades)).sort((a, b) => a.level - b.level);
    if (!grades.length) throw new TypeError(`job '${jobId}' needs at least one grade`);
    const defaultGrade = raw.defaultGrade === undefined ? grades[0].level : integer(raw.defaultGrade, grades[0].level, 0, 1000);
    if (!seenGrades.has(defaultGrade)) throw new TypeError(`job '${jobId}' default grade does not exist`);

    const banking = raw.banking === false ? false : raw.banking ? Object.freeze({
        organizationId: id(raw.banking.organizationId || `job:${jobId}`, "job organization id"),
        currency: id(raw.banking.currency || "galleons", "job banking currency"),
    }) : undefined;
    const payroll = raw.payroll ? Object.freeze({
        intervalMs: integer(raw.payroll.intervalMs, 3_600_000, 60_000, 604_800_000),
        requireDuty: raw.payroll.requireDuty !== false,
        source: raw.payroll.source === "system" || (!raw.payroll.source && !banking) ? "system" as const : "organization" as const,
    }) : undefined;
    if (payroll?.source === "organization" && !banking) throw new TypeError(`job '${jobId}' needs banking for organization-funded payroll`);

    const seenPoints = new Set<string>();
    const dutyPoints = (raw.dutyPoints || []).slice(0, 16).map((point) => {
        if (!point || typeof point !== "object") throw new TypeError("job duty point is required");
        const pointId = id(point.id, "job duty point id");
        if (pointId.length > 16) throw new TypeError("job duty point id is too long");
        if (seenPoints.has(pointId)) throw new TypeError(`job duty point '${pointId}' is duplicated`);
        seenPoints.add(pointId);
        const position = Object.freeze({ x: Number(point.position?.x), y: Number(point.position?.y), z: Number(point.position?.z) });
        if (!Object.values(position).every(Number.isFinite)) throw new TypeError(`job duty point '${pointId}' needs a finite position`);
        return Object.freeze({
            id: pointId,
            label: clean(point.label, 80) || `Toggle ${clean(raw.label, 80) || jobId} duty`,
            description: clean(point.description, 180) || undefined,
            position,
            areaId: clean(point.areaId, 128) || undefined,
            regionId: clean(point.regionId, 128) || undefined,
            radius: integer(point.radius, 250, 25, 5000),
            promptDistance: integer(point.promptDistance, Math.min(integer(point.radius, 250, 25, 5000), 250), 25, integer(point.radius, 250, 25, 5000)),
            promptOffsetZ: integer(point.promptOffsetZ, 0, -5000, 5000),
            virtualWorld: point.virtualWorld === undefined ? undefined : integer(point.virtualWorld, 0, 0, 2_147_483_647),
            object: point.object ? Object.freeze({ ...point.object }) : undefined,
        });
    });

    return Object.freeze({
        id: jobId,
        resource,
        label: clean(raw.label, 80) || jobId,
        description: clean(raw.description, 180) || undefined,
        group: id(raw.group || `job:${jobId}`, "job group"),
        defaultGrade,
        grades: Object.freeze(grades),
        banking,
        payroll,
        dutyPoints: Object.freeze(dutyPoints),
        canDuty: typeof raw.canDuty === "function" ? raw.canDuty : undefined,
    });
}

function mutation<P = HmpJobPlayer>(raw?: HmpJobMutationOptions<P>): Required<Pick<HmpJobMutationOptions<P>, "resource" | "reason" | "metadata">> & Pick<HmpJobMutationOptions<P>, "actor"> {
    return Object.freeze({
        resource: raw?.resource ? id(raw.resource, "job mutation resource") : "hmp-jobs",
        actor: raw?.actor,
        reason: clean(raw?.reason, 191),
        metadata: raw?.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata) ? { ...raw.metadata } : {},
    });
}

export = { clean, id, integer, positiveId, normalizeJob, mutation };
