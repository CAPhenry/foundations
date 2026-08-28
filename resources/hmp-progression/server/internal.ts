import type { HmpCore } from "../../hmp-core/types";
import type { HmpLogger } from "../../hmp-lib/types";
import type { HmpMySQL, HmpMySQLMigration, HmpMySQLTransaction } from "../../hmp-mysql/types";
import type {
    HmpManagedTalent,
    HmpProgression,
    HmpProgressionOperation,
    HmpProgressionPlayer,
    HmpProgressionProfile,
    HmpProgressionRewardTransaction,
    HmpTalentAcquisition,
} from "../types";

export type Player = HogwartsMpPlayer & HmpProgressionPlayer;
export type Core = HmpCore<Player>;
export type Database = HmpMySQL;
export type Logger = Pick<HmpLogger, "info" | "warn" | "error">;

export interface ProgressionConfig {
    enableCommands: boolean;
    command: string;
    adminGroups: Array<{ key: string; minimumGrade: number }>;
    maximumExperience: number;
    maximumTalentPoints: number;
    nativeRequestTimeoutMs: number;
}

export interface RewardDraft {
    reference: string;
    characterId: number;
    operation: HmpProgressionOperation;
    amount: number;
    actorCharacterId: number | null;
    resource: string;
    reason: string;
    metadata: Record<string, unknown>;
}

export interface TalentMutation {
    characterId: number;
    talentId: string;
    level: number;
    status: "owned" | "revoked";
    acquisition: HmpTalentAcquisition;
    actorCharacterId: number | null;
    resource: string;
    reason: string;
}

export interface ProgressionRepository {
    migrate(migrations: HmpMySQLMigration[]): Promise<unknown>;
    profile(characterId: number, tx?: HmpMySQLTransaction, lock?: boolean): Promise<HmpProgressionProfile>;
    reward(reference: string, tx?: HmpMySQLTransaction, lock?: boolean): Promise<HmpProgressionRewardTransaction | null>;
    beginReward(draft: RewardDraft): Promise<{ created: boolean; transaction: HmpProgressionRewardTransaction }>;
    applyReward(reference: string, maximumExperience: number): Promise<HmpProgressionRewardTransaction>;
    failReward(reference: string, error: string): Promise<HmpProgressionRewardTransaction>;
    rewardHistory(characterId: number, limit: number): Promise<HmpProgressionRewardTransaction[]>;
    pendingRewards(limit: number): Promise<HmpProgressionRewardTransaction[]>;
    acknowledge(characterId: number, revision: number, level: number, talentPoints: number): Promise<HmpProgressionProfile>;
    talents(characterId: number, includeRevoked: boolean): Promise<HmpManagedTalent[]>;
    talent(characterId: number, talentId: string, tx?: HmpMySQLTransaction, lock?: boolean): Promise<HmpManagedTalent | null>;
    mutateTalent(mutation: TalentMutation): Promise<HmpManagedTalent>;
    purchaseTalent(mutation: TalentMutation): Promise<HmpManagedTalent>;
    resetTalents(characterId: number, mutation: Omit<TalentMutation, "characterId" | "talentId" | "level" | "status" | "acquisition">): Promise<number>;
    setTalentPoints(characterId: number, points: number): Promise<HmpProgressionProfile>;
}

export interface ProgressionDependencies {
    repository: ProgressionRepository;
    core: Core;
    events: { emit(eventName: string, ...args: unknown[]): unknown };
    logger: Logger;
    config: ProgressionConfig;
    migrations: HmpMySQLMigration[];
    now?: () => number;
    setTimer?: typeof setTimeout;
    clearTimer?: typeof clearTimeout;
}

export interface ProgressionService extends HmpProgression<Player> {
    start(): Promise<void>;
    characterLoaded(player: Player): Promise<void>;
    worldReady(player: Player): Promise<void>;
    nativeReport(player: Player, payload: unknown): Promise<void>;
    nativeResult(player: Player, payload: unknown): Promise<void>;
    disconnect(player: Player): boolean;
    stop(): Promise<void>;
}
