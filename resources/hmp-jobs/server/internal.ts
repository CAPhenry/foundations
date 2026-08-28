import type { HmpBanking } from "../../hmp-banking/types";
import type { HmpCore } from "../../hmp-core/types";
import type { HmpInteractServer } from "../../hmp-interact/types";
import type { HmpLogger } from "../../hmp-lib/types";
import type { HmpMySQL, HmpMySQLMigration } from "../../hmp-mysql/types";
import type { HmpUiServer } from "../../hmp-ui/types";
import type { HmpEmployment, HmpJobAuditEntry, HmpJobPlayer, HmpJobs } from "../types";

export type Player = HogwartsMpPlayer & HmpJobPlayer;
export type Database = HmpMySQL;
export type Core = HmpCore<Player>;
export type Banking = HmpBanking<Player>;
export type Interact = HmpInteractServer<Player>;
export type Ui = HmpUiServer<Player>;
export type Logger = Pick<HmpLogger, "info" | "warn" | "error">;

export interface EmploymentMutation {
    characterId: number;
    jobId: string;
    grade?: number;
    actorCharacterId: number | null;
    resource: string;
    reason: string;
    metadata: Record<string, unknown>;
}

export interface AuditDraft {
    characterId: number;
    jobId: string;
    action: string;
    actorCharacterId?: number | null;
    fromGrade?: number | null;
    toGrade?: number | null;
    resource?: string;
    reason?: string;
    metadata?: Record<string, unknown>;
}

export interface JobsRepository {
    migrate(migrations: HmpMySQLMigration[]): Promise<unknown>;
    get(characterId: number, jobId: string): Promise<HmpEmployment | null>;
    list(characterId: number): Promise<HmpEmployment[]>;
    employees(jobId: string, includeTerminated?: boolean): Promise<HmpEmployment[]>;
    hire(mutation: EmploymentMutation): Promise<HmpEmployment>;
    fire(mutation: EmploymentMutation): Promise<HmpEmployment>;
    setGrade(mutation: EmploymentMutation): Promise<HmpEmployment>;
    setActive(mutation: EmploymentMutation): Promise<HmpEmployment>;
    markPaid(characterId: number, jobId: string, resource: string, metadata?: Record<string, unknown>): Promise<HmpEmployment>;
    audit(draft: AuditDraft): Promise<HmpJobAuditEntry>;
    history(characterId: number, jobId: string | undefined, limit: number): Promise<HmpJobAuditEntry[]>;
}

export interface JobsEvents {
    emit(eventName: string, ...args: unknown[]): unknown;
}

export interface JobsDependencies {
    repository: JobsRepository;
    core: Core;
    banking: Banking;
    interact: Interact;
    ui: Ui;
    events: JobsEvents;
    logger: Logger;
    migrations: HmpMySQLMigration[];
    now?: () => number;
    setInterval?: (handler: () => void, milliseconds: number) => ReturnType<typeof globalThis.setInterval>;
    clearInterval?: (timer: ReturnType<typeof globalThis.setInterval>) => void;
}

export interface JobsService extends HmpJobs<Player> {
    start(): Promise<void>;
    removeForResource(resource: string): number;
    characterLoaded(player: Player): Promise<void>;
    maySwitch(request: { player: Player; allow: boolean; reason?: string }): Promise<boolean>;
    disconnect(player: Player): boolean;
    stop(): Promise<void>;
}
