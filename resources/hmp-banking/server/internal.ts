import type { HmpCore } from "../../hmp-core/types";
import type { HmpInventory } from "../../hmp-inventory/types";
import type { HmpLibServer, HmpLogger } from "../../hmp-lib/types";
import type { HmpMySQL, HmpMySQLMigration, HmpMySQLTransaction } from "../../hmp-mysql/types";
import type { HmpUiServer } from "../../hmp-ui/types";
import type {
    HmpBankAccount,
    HmpBanking,
    HmpBankPlayer,
    HmpBankTransaction,
    HmpBankTransactionStatus,
    HmpBankTransactionType,
} from "../types";

export type Player = HogwartsMpPlayer & HmpBankPlayer;
export type Core = HmpCore<Player>;
export type Inventory = HmpInventory<Player>;
export type Ui = HmpUiServer<Player>;
export type Database = HmpMySQL;
export type Lib = HmpLibServer<Player>;
export type Logger = Pick<HmpLogger, "info" | "warn" | "error">;

export interface AccountOwner {
    type: "personal" | "organization";
    characterId: number | null;
    organizationId: string | null;
    label: string;
    currency: string;
}

export interface LedgerDraft {
    reference: string;
    type: HmpBankTransactionType;
    actorCharacterId: number | null;
    fromAccountId: number | null;
    toAccountId: number | null;
    currency: string;
    amount: number;
    memo: string;
    metadata: Record<string, unknown>;
    resource: string;
}

export interface BankingRepository {
    migrate(migrations: HmpMySQLMigration[]): Promise<unknown>;
    ensureAccount(owner: AccountOwner): Promise<HmpBankAccount>;
    getAccount(id: number, tx?: HmpMySQLTransaction, lock?: boolean): Promise<HmpBankAccount | null>;
    getPersonal(characterId: number, currency: string): Promise<HmpBankAccount | null>;
    listPersonal(characterId: number): Promise<HmpBankAccount[]>;
    getOrganization(organizationId: string, currency: string): Promise<HmpBankAccount | null>;
    getTransaction(reference: string): Promise<HmpBankTransaction | null>;
    pending(limit: number): Promise<HmpBankTransaction[]>;
    begin(draft: LedgerDraft): Promise<{ created: boolean; transaction: HmpBankTransaction }>;
    apply(reference: string, complete?: boolean): Promise<HmpBankTransaction>;
    finish(reference: string): Promise<HmpBankTransaction>;
    fail(reference: string, status: Extract<HmpBankTransactionStatus, "failed" | "compensated">, error?: string, reverse?: boolean): Promise<HmpBankTransaction>;
    history(accountId: number, limit: number): Promise<HmpBankTransaction[]>;
}

export interface BankingEvents {
    emit(eventName: string, ...args: unknown[]): unknown;
}

export interface BankingDependencies {
    repository: BankingRepository;
    core: Core;
    inventory: Inventory;
    ui: Ui;
    events: BankingEvents;
    logger: Logger;
    migrations: HmpMySQLMigration[];
    now?: () => number;
}

export interface BankingService extends HmpBanking<Player> {
    start(): Promise<void>;
    removeForResource(resource: string): number;
    maySwitch(request: { player: Player; allow: boolean; reason?: string }): boolean;
    disconnect(player: Player): boolean;
    stop(): Promise<void>;
}
