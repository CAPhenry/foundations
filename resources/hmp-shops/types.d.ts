import type {
    HmpInteractionCharacter,
    HmpInteractionGroupRequirement,
    HmpInteractionItemRequirement,
    HmpInteractionWorldObject,
    HmpInteractVector3,
} from "../hmp-interact/types";

export interface HmpShopPlayer {
    id: number;
    nickname?: string;
    connected?: boolean;
    position: HmpInteractVector3;
    virtualWorld?: number;
    emit(eventName: string, payload?: unknown): void;
}

export interface HmpShopItemOptions {
    metadata?: Record<string, unknown>;
    variation?: string;
    identified?: boolean;
}

export interface HmpShopAccessContext<P = HmpShopPlayer> {
    player: P;
    character: { id: number } | null;
    shop: HmpShopDefinition<P>;
    offer: HmpShopOffer<P> | null;
    direction: "buy" | "sell" | null;
}

export interface HmpShopRequirements<P = HmpShopPlayer> {
    character?: boolean;
    groups?: ReadonlyArray<HmpInteractionGroupRequirement>;
    groupMode?: "all" | "any";
    items?: ReadonlyArray<HmpInteractionItemRequirement>;
    allow?(context: HmpShopAccessContext<P>): boolean | string | Promise<boolean | string>;
}

export interface HmpShopOffer<P = HmpShopPlayer> {
    id: string;
    item: string;
    label?: string;
    description?: string;
    icon?: string;
    buyPrice?: number;
    sellPrice?: number;
    /** Initial persistent stock. Omit or null for unlimited stock. */
    stock?: number | null;
    maxQuantity?: number;
    itemOptions?: HmpShopItemOptions;
    requirements?: HmpShopRequirements<P>;
}

export interface HmpShopInteraction<P = HmpShopPlayer> {
    position: HmpInteractVector3;
    areaId?: string;
    regionId?: string;
    radius?: number;
    promptDistance?: number;
    promptOffsetZ?: number;
    priority?: number;
    virtualWorld?: number;
    object?: HmpInteractionWorldObject;
    /** Stationary dressed vendor body standing at `position`; the shop's stock is what it sells. */
    character?: HmpInteractionCharacter;
}

export interface HmpShopDefinition<P = HmpShopPlayer> {
    id: string;
    resource: string;
    label: string;
    description?: string;
    currency?: string;
    requirements?: HmpShopRequirements<P>;
    interaction?: HmpShopInteraction<P>;
    offers: ReadonlyArray<HmpShopOffer<P>>;
}

export interface HmpShopCurrencyContext<P = HmpShopPlayer> {
    player: P;
    characterId: number;
    shop: HmpShopDefinition<P>;
    offer: HmpShopOffer<P>;
    direction: "buy" | "sell";
    reference: string;
}

export interface HmpShopCurrencyProvider<P = HmpShopPlayer> {
    id: string;
    resource: string;
    label: string;
    symbol?: string;
    balance(player: P): number | Promise<number>;
    /** Remove funds. Return false when the balance is insufficient. */
    debit(player: P, amount: number, context: HmpShopCurrencyContext<P>): boolean | Promise<boolean>;
    /** Add funds, including compensation refunds. */
    credit(player: P, amount: number, context: HmpShopCurrencyContext<P>): boolean | Promise<boolean>;
}

export interface HmpShopTransaction {
    id: number;
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
    status: "pending" | "completed" | "compensated" | "failed";
    error: string;
    createdAt: string | Date;
    completedAt: string | Date | null;
}

export interface HmpShopTransactionOptions {
    /** Stable caller-supplied idempotency key. Generated when omitted. */
    reference?: string;
}

export interface HmpShopsApi<P = HmpShopPlayer> {
    register(definition: HmpShopDefinition<P>): () => boolean;
    unregister(id: string, resource?: string): boolean;
    get(id: string): HmpShopDefinition<P> | null;
    list(resource?: string): HmpShopDefinition<P>[];
    open(player: P, shopId: string): Promise<HmpShopTransaction | null>;
}

export interface HmpShopCurrenciesApi<P = HmpShopPlayer> {
    register(provider: HmpShopCurrencyProvider<P>): () => boolean;
    unregister(id: string, resource?: string): boolean;
    get(id: string): HmpShopCurrencyProvider<P> | null;
    list(resource?: string): HmpShopCurrencyProvider<P>[];
    balance(player: P, currency?: string): Promise<number>;
}

export interface HmpShopTransactionsApi<P = HmpShopPlayer> {
    buy(player: P, shopId: string, offerId: string, quantity?: number, options?: HmpShopTransactionOptions): Promise<HmpShopTransaction>;
    sell(player: P, shopId: string, offerId: string, quantity?: number, options?: HmpShopTransactionOptions): Promise<HmpShopTransaction>;
    history(player: P | number, limit?: number): Promise<HmpShopTransaction[]>;
}

export interface HmpShopStockApi {
    get(shopId: string, offerId: string): Promise<number | null>;
    set(shopId: string, offerId: string, quantity: number): Promise<number>;
    adjust(shopId: string, offerId: string, delta: number): Promise<number>;
}

export interface HmpShopsStatus {
    state: "starting" | "ready" | "degraded" | "stopped";
    lastError: string;
    shops: number;
    currencies: number;
    activeTransactions: number;
    uptimeMs: number;
}

export interface HmpShops<P = HmpShopPlayer> {
    shops: HmpShopsApi<P>;
    currencies: HmpShopCurrenciesApi<P>;
    transactions: HmpShopTransactionsApi<P>;
    stock: HmpShopStockApi;
    status(): HmpShopsStatus;
}
