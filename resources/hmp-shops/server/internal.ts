import type { HmpCore } from "../../hmp-core/types";
import type { HmpInteractServer } from "../../hmp-interact/types";
import type { HmpInventory } from "../../hmp-inventory/types";
import type { HmpLibServer, HmpLogger } from "../../hmp-lib/types";
import type { HmpMySQL, HmpMySQLMigration } from "../../hmp-mysql/types";
import type { HmpUiServer } from "../../hmp-ui/types";
import type {
    HmpShopPlayer,
    HmpShops,
    HmpShopTransaction,
} from "../types";

export type Player = HogwartsMpPlayer & HmpShopPlayer;
export type Core = HmpCore<Player>;
export type Inventory = HmpInventory<Player>;
export type Interact = HmpInteractServer<Player>;
export type Ui = HmpUiServer<Player>;
export type Database = HmpMySQL;
export type Lib = HmpLibServer<Player>;
export type Logger = Pick<HmpLogger, "info" | "warn" | "error">;

export interface TransactionDraft {
    reference: string;
    characterId: number;
    shopId: string;
    offerId: string;
    item: string;
    direction: "buy" | "sell";
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    currency: string;
}

export interface ShopsRepository {
    migrate(migrations: HmpMySQLMigration[]): Promise<unknown>;
    ensureStock(shopId: string, offerId: string, quantity: number): Promise<number>;
    getStock(shopId: string, offerId: string): Promise<number | null>;
    reserveStock(shopId: string, offerId: string, quantity: number): Promise<boolean>;
    adjustStock(shopId: string, offerId: string, delta: number): Promise<number>;
    setStock(shopId: string, offerId: string, quantity: number): Promise<number>;
    begin(draft: TransactionDraft): Promise<{ created: boolean; transaction: HmpShopTransaction }>;
    finish(reference: string, status: HmpShopTransaction["status"], error?: string): Promise<HmpShopTransaction>;
    history(characterId: number, limit: number): Promise<HmpShopTransaction[]>;
}

export interface ShopsEvents {
    emit(eventName: string, ...args: unknown[]): unknown;
}

export interface ShopsDependencies {
    repository: ShopsRepository;
    core: Core;
    inventory: Inventory;
    interact: Interact;
    ui: Ui;
    events: ShopsEvents;
    logger: Logger;
    migrations: HmpMySQLMigration[];
    now?: () => number;
}

export interface ShopsService extends HmpShops<Player> {
    start(): Promise<void>;
    removeForResource(resource: string): number;
    disconnect(player: Player): boolean;
    stop(): Promise<void>;
}
