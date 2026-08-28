import type { HmpCore } from "../../hmp-core/types";
import type { HmpLogger } from "../../hmp-lib/types";
import type { HmpMySQL, HmpMySQLMigration, HmpMySQLTransaction } from "../../hmp-mysql/types";
import type {
    HmpHouseId,
    HmpHouseMembership,
    HmpHouseMembershipAudit,
    HmpHousePlayer,
    HmpHousePointTransaction,
    HmpHouseStanding,
    HmpHouses,
} from "../types";

export type Player = HogwartsMpPlayer & HmpHousePlayer;
export type Core = HmpCore<Player>;
export type Database = HmpMySQL;
export type Logger = Pick<HmpLogger, "info" | "warn" | "error">;

export interface HouseConfig {
    enableCommands: boolean;
    houseCommand: string;
    pointsCommand: string;
    adminGroups: Array<{ key: string; minimumGrade: number }>;
    groupPrefix: string;
    allowNegativePoints: boolean;
}

export interface MembershipMutation {
    characterId: number;
    house: HmpHouseId;
    actorCharacterId: number | null;
    resource: string;
    reason: string;
}

export interface PointDraft {
    reference: string;
    house: HmpHouseId;
    amount: number;
    actorCharacterId: number | null;
    resource: string;
    reason: string;
    metadata: Record<string, unknown>;
}

export interface HousesRepository {
    migrate(migrations: HmpMySQLMigration[]): Promise<unknown>;
    membership(characterId: number): Promise<HmpHouseMembership | null>;
    setMembership(mutation: MembershipMutation): Promise<{ membership: HmpHouseMembership; previousHouse: HmpHouseId | null }>;
    clearMembership(characterId: number, actorCharacterId: number | null, resource: string, reason: string): Promise<HmpHouseId | null>;
    members(house: HmpHouseId, limit: number): Promise<HmpHouseMembership[]>;
    membershipHistory(characterId: number, limit: number): Promise<HmpHouseMembershipAudit[]>;
    standing(house: HmpHouseId, tx?: HmpMySQLTransaction, lock?: boolean): Promise<HmpHouseStanding>;
    standings(): Promise<HmpHouseStanding[]>;
    pointTransaction(reference: string, tx?: HmpMySQLTransaction, lock?: boolean): Promise<HmpHousePointTransaction | null>;
    beginPoint(draft: PointDraft): Promise<{ created: boolean; transaction: HmpHousePointTransaction }>;
    applyPoint(reference: string, allowNegative: boolean): Promise<HmpHousePointTransaction>;
    failPoint(reference: string, error: string): Promise<HmpHousePointTransaction>;
    pointHistory(house: HmpHouseId | undefined, limit: number): Promise<HmpHousePointTransaction[]>;
    pendingPoints(limit: number): Promise<HmpHousePointTransaction[]>;
}

export interface HousesDependencies {
    repository: HousesRepository;
    core: Core;
    events: { emit(eventName: string, ...args: unknown[]): unknown };
    logger: Logger;
    config: HouseConfig;
    migrations: HmpMySQLMigration[];
    now?: () => number;
}

export interface HousesService extends HmpHouses<Player> {
    start(): Promise<void>;
    characterLoaded(player: Player): Promise<void>;
    disconnect(player: Player): boolean;
    stop(): Promise<void>;
}
