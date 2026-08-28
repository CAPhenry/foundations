export type HmpBankAccountType = "personal" | "organization";
export type HmpBankAccountStatus = "active" | "frozen" | "closed";
export type HmpBankPermission = "view" | "deposit" | "withdraw" | "transfer" | "manage";
export type HmpBankTransactionType = "credit" | "debit" | "transfer" | "deposit" | "withdraw";
export type HmpBankTransactionStatus = "pending" | "completed" | "compensated" | "failed";

export interface HmpBankPlayer {
    id: number;
    nickname?: string;
    connected?: boolean;
    emit(eventName: string, payload?: unknown): void;
}

export interface HmpBankCurrency {
    id: string;
    resource: string;
    label: string;
    symbol?: string;
    /** Inventory item exchanged by cash.deposit/withdraw. Omit for ledger-only currencies. */
    cashItem?: string;
}

export interface HmpBankAccount {
    id: number;
    number: string;
    type: HmpBankAccountType;
    characterId: number | null;
    organizationId: string | null;
    label: string;
    currency: string;
    balance: number;
    status: HmpBankAccountStatus;
    createdAt: string | Date;
    updatedAt: string | Date;
}

export interface HmpBankOrganizationRule {
    group: string;
    minimumGrade?: number;
    permissions: ReadonlyArray<HmpBankPermission>;
}

export interface HmpBankOrganizationContext<P = HmpBankPlayer> {
    player: P;
    character: { id: number } | null;
    organization: HmpBankOrganizationDefinition<P>;
    account: HmpBankAccount;
    permission: HmpBankPermission;
}

export interface HmpBankOrganizationDefinition<P = HmpBankPlayer> {
    id: string;
    resource: string;
    label: string;
    currency?: string;
    rules?: ReadonlyArray<HmpBankOrganizationRule>;
    allow?(context: HmpBankOrganizationContext<P>): boolean | string | Promise<boolean | string>;
}

export interface HmpBankTransaction {
    id: number;
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
    status: HmpBankTransactionStatus;
    error: string;
    createdAt: string | Date;
    appliedAt: string | Date | null;
    completedAt: string | Date | null;
}

export interface HmpBankTransactionOptions<P = HmpBankPlayer> {
    /** Owning resource recorded in the audit ledger. */
    resource: string;
    /** Stable, globally unique idempotency key. */
    reference?: string;
    memo?: string;
    metadata?: Record<string, unknown>;
    actor?: P | number | null;
}

export interface HmpBankCashOptions {
    reference?: string;
    memo?: string;
}

export interface HmpBankShopProviderOptions {
    id?: string;
    resource: string;
    currency?: string;
    label?: string;
    symbol?: string;
}

/** Structurally compatible with hmp-shops' currency provider contract. */
export interface HmpBankShopCurrencyProvider<P = HmpBankPlayer> {
    id: string;
    resource: string;
    label: string;
    symbol?: string;
    balance(player: P): Promise<number>;
    debit(player: P, amount: number, context: { reference: string }): Promise<boolean>;
    credit(player: P, amount: number, context: { reference: string }): Promise<boolean>;
}

export interface HmpBankAccountsApi<P = HmpBankPlayer> {
    personal(target: P | number, currency?: string): Promise<HmpBankAccount>;
    organization(id: string): Promise<HmpBankAccount | null>;
    get(id: number): Promise<HmpBankAccount | null>;
    byNumber(number: string): Promise<HmpBankAccount | null>;
    list(player: P): Promise<HmpBankAccount[]>;
    can(player: P, account: HmpBankAccount | number, permission: HmpBankPermission): Promise<boolean>;
}

export interface HmpBankOrganizationsApi<P = HmpBankPlayer> {
    register(definition: HmpBankOrganizationDefinition<P>): () => boolean;
    unregister(id: string, resource?: string): boolean;
    get(id: string): HmpBankOrganizationDefinition<P> | null;
    list(resource?: string): HmpBankOrganizationDefinition<P>[];
}

export interface HmpBankCurrenciesApi {
    register(currency: HmpBankCurrency): () => boolean;
    unregister(id: string, resource?: string): boolean;
    get(id: string): HmpBankCurrency | null;
    list(resource?: string): HmpBankCurrency[];
}

export interface HmpBankTransactionsApi<P = HmpBankPlayer> {
    credit(account: HmpBankAccount | number, amount: number, options: HmpBankTransactionOptions<P>): Promise<HmpBankTransaction>;
    debit(account: HmpBankAccount | number, amount: number, options: HmpBankTransactionOptions<P>): Promise<HmpBankTransaction>;
    transfer(from: HmpBankAccount | number, to: HmpBankAccount | number, amount: number, options: HmpBankTransactionOptions<P>): Promise<HmpBankTransaction>;
    get(reference: string): Promise<HmpBankTransaction | null>;
    pending(limit?: number): Promise<HmpBankTransaction[]>;
    /** Trusted operator recovery for a pending cross-system transaction. */
    reconcile(reference: string, resolution: "complete" | "compensate" | "fail", error?: string): Promise<HmpBankTransaction>;
    history(account: HmpBankAccount | number, limit?: number): Promise<HmpBankTransaction[]>;
}

export interface HmpBankCashApi<P = HmpBankPlayer> {
    deposit(player: P, account: HmpBankAccount | number, amount: number, options?: HmpBankCashOptions): Promise<HmpBankTransaction>;
    withdraw(player: P, account: HmpBankAccount | number, amount: number, options?: HmpBankCashOptions): Promise<HmpBankTransaction>;
}

export interface HmpBankProvidersApi<P = HmpBankPlayer> {
    shops(options: HmpBankShopProviderOptions): HmpBankShopCurrencyProvider<P>;
}

export interface HmpBankUiApi<P = HmpBankPlayer> {
    open(player: P, account?: HmpBankAccount | number): Promise<HmpBankTransaction | null>;
    close(player: P): boolean;
}

export interface HmpBankStatus {
    state: "starting" | "ready" | "degraded" | "stopped";
    lastError: string;
    organizations: number;
    currencies: number;
    activeOperations: number;
    openMenus: number;
    uptimeMs: number;
}

export interface HmpBanking<P = HmpBankPlayer> {
    accounts: HmpBankAccountsApi<P>;
    organizations: HmpBankOrganizationsApi<P>;
    currencies: HmpBankCurrenciesApi;
    transactions: HmpBankTransactionsApi<P>;
    cash: HmpBankCashApi<P>;
    providers: HmpBankProvidersApi<P>;
    ui: HmpBankUiApi<P>;
    status(): HmpBankStatus;
}
