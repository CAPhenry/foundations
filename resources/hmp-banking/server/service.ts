import normalizeModule = require("../shared/normalize");
import type {
    HmpBankAccount,
    HmpBankCashOptions,
    HmpBankCurrency,
    HmpBankOrganizationContext,
    HmpBankOrganizationDefinition,
    HmpBankPermission,
    HmpBankShopProviderOptions,
    HmpBankTransaction,
    HmpBankTransactionOptions,
    HmpBankTransactionType,
} from "../types";
import type { BankingDependencies, BankingService, LedgerDraft, Player } from "./internal";

const {
    MAX_AMOUNT,
    clean,
    id: normalizeId,
    reference: normalizeReference,
    integer,
    amount: normalizeAmount,
    metadata: normalizeMetadata,
    normalizeCurrency,
    normalizeOrganization,
    accountId: normalizeAccountId,
} = normalizeModule;

interface OrganizationRecord {
    definition: HmpBankOrganizationDefinition<Player>;
    ready: Promise<HmpBankAccount>;
}

function bankError(code: string, message: string): Error {
    return Object.assign(new Error(message), { code });
}

function messageOf(error: unknown): string {
    return clean(error instanceof Error ? error.message : String(error), 191) || "unknown error";
}

function errorCode(error: unknown): string {
    return error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "") : "";
}

function hash(value: string): string {
    let current = 2166136261;
    for (let index = 0; index < value.length; index++) {
        current ^= value.charCodeAt(index);
        current = Math.imul(current, 16777619);
    }
    return (current >>> 0).toString(36);
}

function compactReference(prefix: string, value: string): string {
    const safe = value.replace(/[^A-Za-z0-9_.:-]/g, "_");
    const suffix = hash(value);
    return normalizeReference(`${prefix}:${safe.slice(0, 94 - prefix.length - suffix.length)}:${suffix}`);
}

function createBankingService(dependencies: BankingDependencies): BankingService {
    const { repository, core, inventory, ui, events, logger, migrations } = dependencies;
    const now = dependencies.now || Date.now;
    const startedAt = now();
    const currencies = new Map<string, HmpBankCurrency>();
    const organizations = new Map<string, OrganizationRecord>();
    const activeOperations = new Set<number>();
    const openMenus = new Set<number>();
    let sequence = 0;
    let state: "starting" | "ready" | "degraded" | "stopped" = "starting";
    let lastError = "";
    let startPromise: Promise<void> | null = null;

    function playerId(player: Player): number {
        const value = Number(player?.id);
        if (!Number.isSafeInteger(value) || value < 0 || typeof player?.emit !== "function") throw new TypeError("a connected player is required");
        return value;
    }

    function activeCharacter(player: Player) {
        playerId(player);
        const character = core.characters.active(player);
        if (!character) throw bankError("HMP_BANK_CHARACTER", "Select a character before using banking.");
        return character;
    }

    function characterId(target: Player | number): number {
        if (typeof target === "number") {
            if (!Number.isSafeInteger(target) || target <= 0) throw new TypeError("character id is invalid");
            return target;
        }
        return activeCharacter(target).id;
    }

    function currencyFor(rawId = "galleons"): HmpBankCurrency {
        const currencyId = normalizeId(rawId, "bank currency id");
        const currency = currencies.get(currencyId);
        if (!currency) throw bankError("HMP_BANK_CURRENCY", `Bank currency '${currencyId}' is unavailable.`);
        return currency;
    }

    function start(): Promise<void> {
        if (state === "stopped") return Promise.reject(new Error("hmp-banking is stopped"));
        if (startPromise) return startPromise;
        state = "starting";
        startPromise = repository.migrate(migrations)
            .then(() => {
                state = "ready";
                lastError = "";
            })
            .catch((error) => {
                state = "degraded";
                lastError = messageOf(error);
                throw error;
            });
        return startPromise;
    }

    async function personal(target: Player | number, rawCurrency = "galleons"): Promise<HmpBankAccount> {
        await start();
        const currency = currencyFor(rawCurrency);
        const character = typeof target === "number" ? null : activeCharacter(target);
        const id = character ? character.id : characterId(target);
        if (!character) {
            const existing = await repository.getPersonal(id, currency.id);
            if (existing) return existing;
        }
        return repository.ensureAccount({
            type: "personal",
            characterId: id,
            organizationId: null,
            label: character ? `${character.name}'s account` : `Personal account ${id}`,
            currency: currency.id,
        });
    }

    async function organization(rawId: string): Promise<HmpBankAccount | null> {
        const organizationId = normalizeId(rawId, "bank organization id");
        const record = organizations.get(organizationId);
        if (!record) return null;
        await record.ready;
        return repository.getOrganization(organizationId, record.definition.currency || "galleons");
    }

    function registerCurrency(raw: HmpBankCurrency): () => boolean {
        if (state === "stopped") throw new Error("hmp-banking is stopped");
        const currency = normalizeCurrency(raw);
        if (currency.cashItem && !inventory.items.get(currency.cashItem)) throw new Error(`bank currency '${currency.id}' references unknown cash item '${currency.cashItem}'`);
        const existing = currencies.get(currency.id);
        if (existing && existing.resource !== currency.resource) throw new Error(`bank currency '${currency.id}' is already owned by '${existing.resource}'`);
        currencies.set(currency.id, currency);
        let registered = true;
        return () => {
            if (!registered || currencies.get(currency.id) !== currency) return false;
            registered = false;
            return unregisterCurrency(currency.id, currency.resource);
        };
    }

    function unregisterCurrency(rawId: string, resource?: string): boolean {
        const currencyId = String(rawId || "").trim();
        const currency = currencies.get(currencyId);
        if (!currency || (resource && currency.resource !== resource)) return false;
        if ([...organizations.values()].some((record) => record.definition.currency === currencyId)) return false;
        return currencies.delete(currencyId);
    }

    function registerOrganization(raw: HmpBankOrganizationDefinition<Player>): () => boolean {
        if (state === "stopped") throw new Error("hmp-banking is stopped");
        const definition = normalizeOrganization(raw);
        currencyFor(definition.currency || "galleons");
        const existing = organizations.get(definition.id);
        if (existing && existing.definition.resource !== definition.resource) throw new Error(`bank organization '${definition.id}' is already owned by '${existing.definition.resource}'`);
        const ready = start().then(() => repository.ensureAccount({
            type: "organization",
            characterId: null,
            organizationId: definition.id,
            label: definition.label,
            currency: definition.currency || "galleons",
        }));
        const record = { definition, ready };
        organizations.set(definition.id, record);
        ready.catch((error) => logger.error(`[hmp-banking] could not initialize '${definition.id}'`, error));
        let registered = true;
        return () => {
            if (!registered || organizations.get(definition.id) !== record) return false;
            registered = false;
            return unregisterOrganization(definition.id, definition.resource);
        };
    }

    function unregisterOrganization(rawId: string, resource?: string): boolean {
        const organizationId = String(rawId || "").trim();
        const record = organizations.get(organizationId);
        if (!record || (resource && record.definition.resource !== resource)) return false;
        return organizations.delete(organizationId);
    }

    async function accountValue(value: HmpBankAccount | number): Promise<HmpBankAccount> {
        const id = normalizeAccountId(typeof value === "object" ? value.id : value);
        const account = await repository.getAccount(id);
        if (!account) throw bankError("HMP_BANK_ACCOUNT", `Bank account '${id}' does not exist.`);
        return account;
    }

    async function access(player: Player, rawAccount: HmpBankAccount | number, permission: HmpBankPermission): Promise<{ ok: boolean; reason: string; account: HmpBankAccount }> {
        const character = activeCharacter(player);
        const account = await accountValue(rawAccount);
        if (account.status !== "active") return { ok: false, reason: `That account is ${account.status}.`, account };
        if (account.type === "personal") {
            const ok = account.characterId === character.id;
            return { ok, reason: ok ? "" : "You cannot access that personal account.", account };
        }
        const record = account.organizationId ? organizations.get(account.organizationId) : null;
        if (!record) return { ok: false, reason: "That organization account is unavailable.", account };
        const definition = record.definition;
        const rules = definition.rules || [];
        let allowed = false;
        for (const rule of rules) {
            if (!rule.permissions.includes(permission) && !rule.permissions.includes("manage")) continue;
            if (await core.groups.has(player, rule.group, rule.minimumGrade || 0)) { allowed = true; break; }
        }
        if (!rules.length && definition.allow) allowed = true;
        if (!allowed) return { ok: false, reason: "You do not have access to that organization account.", account };
        if (definition.allow) {
            const context: HmpBankOrganizationContext<Player> = { player, character, organization: definition, account, permission };
            const result = await definition.allow(context);
            if (result !== true) return { ok: false, reason: typeof result === "string" ? clean(result, 160) || "That banking action is unavailable." : "That banking action is unavailable.", account };
        }
        return { ok: true, reason: "", account };
    }

    async function listAccounts(player: Player): Promise<HmpBankAccount[]> {
        const character = activeCharacter(player);
        await personal(player);
        const result = await repository.listPersonal(character.id);
        for (const record of organizations.values()) {
            await record.ready;
            const account = await repository.getOrganization(record.definition.id, record.definition.currency || "galleons");
            if (!account) continue;
            if ((await access(player, account, "view")).ok) result.push(account);
        }
        return result;
    }

    function actorId(actor: Player | number | null | undefined): number | null {
        if (actor === null || actor === undefined) return null;
        return characterId(actor);
    }

    function generatedReference(type: string, actor: number | null): string {
        return normalizeReference(`bank:${type}:${actor || 0}:${now().toString(36)}:${(++sequence).toString(36)}`);
    }

    function assertReplay(transaction: HmpBankTransaction, draft: LedgerDraft): void {
        if (
            transaction.type !== draft.type
            || transaction.actorCharacterId !== draft.actorCharacterId
            || transaction.fromAccountId !== draft.fromAccountId
            || transaction.toAccountId !== draft.toAccountId
            || transaction.currency !== draft.currency
            || transaction.amount !== draft.amount
            || transaction.resource !== draft.resource
        ) throw bankError("HMP_BANK_REFERENCE", `Transaction reference '${draft.reference}' was reused for a different operation.`);
    }

    async function ledgerOperation(
        type: Extract<HmpBankTransactionType, "credit" | "debit" | "transfer">,
        from: HmpBankAccount | null,
        to: HmpBankAccount | null,
        rawAmount: number,
        options: HmpBankTransactionOptions<Player>,
    ): Promise<HmpBankTransaction> {
        if (!options || typeof options !== "object") throw new TypeError("bank transaction options are required");
        const operationOwner = options.actor && typeof options.actor === "object" ? playerId(options.actor) : null;
        if (operationOwner !== null && activeOperations.has(operationOwner)) throw bankError("HMP_BANK_BUSY", "A banking operation is already in progress.");
        if (operationOwner !== null) activeOperations.add(operationOwner);
        try {
            const amount = normalizeAmount(rawAmount);
            const resource = normalizeId(options.resource, "bank transaction resource");
            if (from && to && from.id === to.id) throw new TypeError("source and destination bank accounts must differ");
            const currency = (from || to)?.currency;
            if (!currency || (from && to && from.currency !== to.currency)) throw bankError("HMP_BANK_CURRENCY", "Bank account currencies do not match.");
            const actorCharacterId = actorId(options.actor);
            const reference = options.reference ? normalizeReference(options.reference) : generatedReference(type, actorCharacterId);
            const draft: LedgerDraft = {
                reference,
                type,
                actorCharacterId,
                fromAccountId: from?.id || null,
                toAccountId: to?.id || null,
                currency,
                amount,
                memo: clean(options.memo, 120),
                metadata: normalizeMetadata(options.metadata),
                resource,
            };
            const started = await repository.begin(draft);
            assertReplay(started.transaction, draft);
            if (!started.created) {
                if (started.transaction.status === "completed") return started.transaction;
                throw bankError("HMP_BANK_REFERENCE", `Transaction reference '${reference}' has already been used.`);
            }
            try {
                const completed = await repository.apply(reference, true);
                try { events.emit("hmp:banking:transaction", { transaction: completed }); }
                catch (error) { logger.warn("A banking transaction listener failed", error); }
                return completed;
            } catch (error) {
                try {
                    const current = await repository.getTransaction(reference);
                    if (current?.status === "completed") return current;
                } catch (readError) {
                    logger.error(`[hmp-banking] transaction '${reference}' completion check failed`, readError);
                }
                try { await repository.fail(reference, "failed", messageOf(error)); }
                catch (ledgerError) { logger.error(`[hmp-banking] transaction '${reference}' ledger update failed`, ledgerError); }
                throw error;
            }
        } finally {
            if (operationOwner !== null) activeOperations.delete(operationOwner);
        }
    }

    async function credit(account: HmpBankAccount | number, amount: number, options: HmpBankTransactionOptions<Player>): Promise<HmpBankTransaction> {
        return ledgerOperation("credit", null, await accountValue(account), amount, options);
    }

    async function debit(account: HmpBankAccount | number, amount: number, options: HmpBankTransactionOptions<Player>): Promise<HmpBankTransaction> {
        return ledgerOperation("debit", await accountValue(account), null, amount, options);
    }

    async function transfer(from: HmpBankAccount | number, to: HmpBankAccount | number, amount: number, options: HmpBankTransactionOptions<Player>): Promise<HmpBankTransaction> {
        return ledgerOperation("transfer", await accountValue(from), await accountValue(to), amount, options);
    }

    async function reconcile(rawReference: string, resolution: "complete" | "compensate" | "fail", error = ""): Promise<HmpBankTransaction> {
        const reference = normalizeReference(rawReference);
        if (!["complete", "compensate", "fail"].includes(resolution)) throw new TypeError("bank reconciliation resolution is invalid");
        const transaction = await repository.getTransaction(reference);
        if (!transaction) throw bankError("HMP_BANK_TRANSACTION", `Bank transaction '${reference}' does not exist.`);
        if (transaction.status !== "pending") return transaction;
        const reconciled = resolution === "complete"
            ? await repository.apply(reference, true)
            : await repository.fail(reference, resolution === "compensate" ? "compensated" : "failed", clean(error, 191), resolution === "compensate" && transaction.appliedAt !== null);
        try { events.emit("hmp:banking:reconciled", { transaction: reconciled, resolution }); }
        catch (listenerError) { logger.warn("A bank reconciliation listener failed", listenerError); }
        return reconciled;
    }

    async function beginCash(player: Player, rawAccount: HmpBankAccount | number, rawAmount: number, type: "deposit" | "withdraw", options?: HmpBankCashOptions) {
        const permission = type === "deposit" ? "deposit" : "withdraw";
        const result = await access(player, rawAccount, permission);
        if (!result.ok) throw bankError("HMP_BANK_ACCESS", result.reason);
        const amount = normalizeAmount(rawAmount);
        const character = activeCharacter(player);
        const currency = currencyFor(result.account.currency);
        if (!currency.cashItem) throw bankError("HMP_BANK_CASH", `${currency.label} cannot be exchanged as cash.`);
        const reference = options?.reference ? normalizeReference(options.reference) : generatedReference(type, character.id);
        const draft: LedgerDraft = {
            reference,
            type,
            actorCharacterId: character.id,
            fromAccountId: type === "withdraw" ? result.account.id : null,
            toAccountId: type === "deposit" ? result.account.id : null,
            currency: currency.id,
            amount,
            memo: clean(options?.memo, 120),
            metadata: {},
            resource: "hmp-banking",
        };
        const started = await repository.begin(draft);
        assertReplay(started.transaction, draft);
        if (!started.created) {
            if (started.transaction.status === "completed") return { existing: started.transaction, account: result.account, currency, character, amount, reference };
            throw bankError("HMP_BANK_REFERENCE", `Transaction reference '${reference}' has already been used.`);
        }
        return { existing: null, account: result.account, currency, character, amount, reference };
    }

    async function deposit(player: Player, account: HmpBankAccount | number, rawAmount: number, options?: HmpBankCashOptions): Promise<HmpBankTransaction> {
        const owner = playerId(player);
        if (activeOperations.has(owner)) throw bankError("HMP_BANK_BUSY", "A cash operation is already in progress.");
        activeOperations.add(owner);
        let moved = 0;
        let reference = "";
        let cashItem = "";
        let applyAttempted = false;
        try {
            const started = await beginCash(player, account, rawAmount, "deposit", options);
            if (started.existing) return started.existing;
            reference = started.reference;
            cashItem = started.currency.cashItem!;
            if (!await inventory.inventory.has(player, cashItem, started.amount)) throw bankError("HMP_BANK_CASH", `You do not have enough ${started.currency.label} cash.`);
            moved = await inventory.inventory.remove(player, cashItem, started.amount);
            if (moved !== started.amount) throw new Error("inventory removed only part of the cash deposit");
            applyAttempted = true;
            const completed = await repository.apply(reference, true);
            try { events.emit("hmp:banking:deposited", { player, character: started.character, account: started.account, transaction: completed }); }
            catch (error) { logger.warn("A bank deposit listener failed", error); }
            return completed;
        } catch (error) {
            if (reference) {
                let known = true;
                try {
                    const current = await repository.getTransaction(reference);
                    if (current?.status === "completed") return current;
                    if (current?.appliedAt) {
                        logger.error(`[hmp-banking] deposit '${reference}' is applied but unfinished; operator reconciliation is required`);
                        throw error;
                    }
                } catch (readError) {
                    if (readError !== error) logger.error(`[hmp-banking] deposit '${reference}' completion check failed`, readError);
                    known = false;
                }
                if (applyAttempted && !known) throw error;
                let restored = moved === 0;
                if (moved > 0) {
                    try { restored = (await inventory.inventory.add(player, cashItem, moved)) === moved; }
                    catch (compensationError) { logger.error(`[hmp-banking] deposit '${reference}' cash compensation failed`, compensationError); }
                }
                try { await repository.fail(reference, restored && moved > 0 ? "compensated" : "failed", messageOf(error)); }
                catch (ledgerError) { logger.error(`[hmp-banking] deposit '${reference}' ledger update failed`, ledgerError); }
            }
            throw error;
        } finally {
            activeOperations.delete(owner);
        }
    }

    async function withdraw(player: Player, account: HmpBankAccount | number, rawAmount: number, options?: HmpBankCashOptions): Promise<HmpBankTransaction> {
        const owner = playerId(player);
        if (activeOperations.has(owner)) throw bankError("HMP_BANK_BUSY", "A cash operation is already in progress.");
        activeOperations.add(owner);
        let moved = 0;
        let applied = false;
        let reference = "";
        let cashItem = "";
        let applyAttempted = false;
        try {
            const started = await beginCash(player, account, rawAmount, "withdraw", options);
            if (started.existing) return started.existing;
            reference = started.reference;
            cashItem = started.currency.cashItem!;
            applyAttempted = true;
            await repository.apply(reference, false);
            applied = true;
            moved = await inventory.inventory.add(player, cashItem, started.amount);
            if (moved !== started.amount) throw new Error("inventory accepted only part of the cash withdrawal");
            const completed = await repository.finish(reference);
            try { events.emit("hmp:banking:withdrawn", { player, character: started.character, account: started.account, transaction: completed }); }
            catch (error) { logger.warn("A bank withdrawal listener failed", error); }
            return completed;
        } catch (error) {
            if (reference) {
                let known = true;
                try {
                    const current = await repository.getTransaction(reference);
                    if (current?.status === "completed") return current;
                    if (current?.appliedAt) applied = true;
                } catch (readError) {
                    logger.error(`[hmp-banking] withdrawal '${reference}' completion check failed`, readError);
                    known = false;
                }
                if (applyAttempted && !known) throw error;
            }
            let cashRemoved = moved === 0;
            if (moved > 0) {
                try {
                    cashRemoved = (await inventory.inventory.remove(player, cashItem, moved)) === moved;
                } catch (compensationError) { logger.error(`[hmp-banking] withdrawal '${reference}' cash compensation failed`, compensationError); }
            }
            if (reference) {
                try {
                    if (applied && !cashRemoved) throw new Error("withdrawal cash could not be reclaimed before account reversal");
                    await repository.fail(reference, applied ? "compensated" : "failed", messageOf(error), applied);
                } catch (ledgerError) { logger.error(`[hmp-banking] withdrawal '${reference}' ledger compensation failed`, ledgerError); }
            }
            throw error;
        } finally {
            activeOperations.delete(owner);
        }
    }

    function money(amount: number, currency: HmpBankCurrency): string {
        return currency.symbol ? `${currency.symbol}${amount}` : `${amount} ${currency.label}`;
    }

    async function chooseAmount(player: Player, title: string, maximum: number, memo = false): Promise<{ amount: number; memo: string } | null> {
        const response = await ui.input(player, {
            title,
            fields: [
                { name: "amount", label: "Amount", type: "number", required: true, min: 1, max: maximum },
                ...(memo ? [{ name: "memo", label: "Memo", type: "text" as const, required: false }] : []),
            ],
            submitLabel: "Continue",
            allowCancel: true,
        });
        if (!response) return null;
        try { return { amount: normalizeAmount(response.amount), memo: clean(response.memo, 120) }; }
        catch { ui.notify(player, { description: "Enter a valid positive amount.", tone: "warning" }); return null; }
    }

    async function showHistory(player: Player, account: HmpBankAccount, currency: HmpBankCurrency): Promise<void> {
        const transactions = await repository.history(account.id, 20);
        await ui.context(player, {
            title: `${account.label} activity`,
            description: account.number,
            options: transactions.length ? transactions.map((transaction) => {
                const incoming = transaction.toAccountId === account.id;
                const sign = incoming ? "+" : "−";
                return {
                    id: `transaction-${transaction.id}`,
                    title: `${sign}${money(transaction.amount, currency)}`,
                    description: transaction.memo || transaction.type,
                    disabled: true,
                    metadata: [{ label: "Status", value: transaction.status }, { label: "Reference", value: transaction.reference }],
                };
            }) : [{ id: "empty", title: "No transactions yet", disabled: true }],
            canClose: true,
        });
    }

    async function open(player: Player, requested?: HmpBankAccount | number): Promise<HmpBankTransaction | null> {
        const owner = playerId(player);
        if (openMenus.has(owner)) return null;
        openMenus.add(owner);
        try {
            let account: HmpBankAccount | null = requested ? await accountValue(requested) : null;
            if (!account) {
                const available = await listAccounts(player);
                const selected = await ui.context(player, {
                    title: "Bank accounts",
                    description: "Choose an account.",
                    options: available.map((entry) => ({ id: String(entry.id), title: entry.label, description: entry.number, metadata: [{ label: "Balance", value: money(entry.balance, currencyFor(entry.currency)) }] })),
                    canClose: true,
                });
                if (!selected) return null;
                account = available.find((entry) => String(entry.id) === selected) || null;
                if (!account) return null;
            }
            const viewing = await access(player, account, "view");
            if (!viewing.ok) throw bankError("HMP_BANK_ACCESS", viewing.reason);
            account = viewing.account;
            const currency = currencyFor(account.currency);
            const permissions = await Promise.all((["deposit", "withdraw", "transfer"] as const).map((permission) => access(player, account!, permission)));
            const cash = currency.cashItem ? await inventory.inventory.count(player, currency.cashItem) : 0;
            const action = await ui.context(player, {
                title: account.label,
                description: `${account.number} · Balance ${money(account.balance, currency)}`,
                options: [
                    { id: "deposit", title: "Deposit cash", description: currency.cashItem ? `Carrying ${money(cash, currency)}` : "Cash deposits unavailable", disabled: !currency.cashItem || !permissions[0].ok || cash < 1 },
                    { id: "withdraw", title: "Withdraw cash", description: `Balance ${money(account.balance, currency)}`, disabled: !currency.cashItem || !permissions[1].ok || account.balance < 1 },
                    { id: "transfer", title: "Transfer", description: "Send funds to an account number", disabled: !permissions[2].ok || account.balance < 1 },
                    { id: "history", title: "Recent activity", description: "View the last 20 ledger entries" },
                ],
                canClose: true,
            });
            if (!action) return null;
            if (action === "history") { await showHistory(player, account, currency); return null; }
            if (action === "deposit") {
                const input = await chooseAmount(player, "Deposit cash", cash);
                if (!input) return null;
                if (await ui.alert(player, { title: `Deposit ${money(input.amount, currency)}?`, confirmLabel: "Deposit", cancel: true }) !== "confirm") return null;
                const transaction = await deposit(player, account, input.amount);
                ui.notify(player, { description: `Deposited ${money(input.amount, currency)}.`, tone: "success" });
                return transaction;
            }
            if (action === "withdraw") {
                const input = await chooseAmount(player, "Withdraw cash", account.balance);
                if (!input) return null;
                if (await ui.alert(player, { title: `Withdraw ${money(input.amount, currency)}?`, confirmLabel: "Withdraw", cancel: true }) !== "confirm") return null;
                const transaction = await withdraw(player, account, input.amount);
                ui.notify(player, { description: `Withdrew ${money(input.amount, currency)}.`, tone: "success" });
                return transaction;
            }
            if (action === "transfer") {
                const response = await ui.input(player, {
                    title: "Transfer funds",
                    fields: [
                        { name: "account", label: "Destination account", type: "text", required: true, placeholder: "HMP-00000000" },
                        { name: "amount", label: "Amount", type: "number", required: true, min: 1, max: account.balance },
                        { name: "memo", label: "Memo", type: "text" },
                    ],
                    submitLabel: "Continue",
                    allowCancel: true,
                });
                if (!response) return null;
                const destination = await repository.getAccount(normalizeAccountId(response.account));
                if (!destination) throw bankError("HMP_BANK_ACCOUNT", "The destination account does not exist.");
                const amount = normalizeAmount(response.amount);
                const memo = clean(response.memo, 120);
                if (await ui.alert(player, { title: `Send ${money(amount, currency)} to ${destination.label}?`, content: destination.number, confirmLabel: "Transfer", cancel: true }) !== "confirm") return null;
                const transaction = await transfer(account, destination, amount, { resource: "hmp-banking", actor: player, memo });
                ui.notify(player, { description: `Transferred ${money(amount, currency)}.`, tone: "success" });
                try { events.emit("hmp:banking:transferred", { player, account, destination, transaction }); }
                catch (error) { logger.warn("A bank transfer listener failed", error); }
                return transaction;
            }
            return null;
        } catch (error) {
            logger.warn(`[hmp-banking] could not complete menu action for #${owner}: ${messageOf(error)}`);
            ui.notify(player, { description: messageOf(error), tone: "error" });
            return null;
        } finally {
            openMenus.delete(owner);
        }
    }

    function shopsProvider(options: HmpBankShopProviderOptions) {
        if (!options || typeof options !== "object") throw new TypeError("bank shop provider options are required");
        const currency = currencyFor(options.currency || "galleons");
        const resource = normalizeId(options.resource, "bank shop provider resource");
        const providerId = normalizeId(options.id || `bank-${currency.id}`, "bank shop provider id");
        return Object.freeze({
            id: providerId,
            resource,
            label: clean(options.label, 48) || `Banked ${currency.label}`,
            symbol: clean(options.symbol, 8) || currency.symbol,
            balance: async (player: Player) => (await personal(player, currency.id)).balance,
            debit: async (player: Player, amount: number, context: { reference: string }) => {
                try {
                    await debit(await personal(player, currency.id), amount, {
                        resource,
                        actor: player,
                        reference: compactReference("bankd", context.reference),
                        memo: "Shop purchase",
                        metadata: { shopReference: context.reference },
                    });
                    return true;
                } catch (error) {
                    if (errorCode(error) === "HMP_BANK_FUNDS") return false;
                    throw error;
                }
            },
            credit: async (player: Player, amount: number, context: { reference: string }) => {
                await credit(await personal(player, currency.id), amount, {
                    resource,
                    actor: player,
                    reference: compactReference("bankc", context.reference),
                    memo: "Shop sale",
                    metadata: { shopReference: context.reference },
                });
                return true;
            },
        });
    }

    function removeForResource(resource: string): number {
        let removed = 0;
        for (const record of [...organizations.values()]) if (record.definition.resource === resource && unregisterOrganization(record.definition.id, resource)) removed++;
        for (const currency of [...currencies.values()]) if (currency.resource === resource && unregisterCurrency(currency.id, resource)) removed++;
        return removed;
    }

    function maySwitch(request: { player: Player; allow: boolean; reason?: string }): boolean {
        const owner = playerId(request.player);
        if (activeOperations.has(owner)) {
            request.allow = false;
            request.reason = "Wait for the banking operation to finish before changing character.";
            return false;
        }
        if (openMenus.delete(owner)) ui.close(request.player, "Banking closed for character switch");
        return true;
    }

    function disconnect(player: Player): boolean {
        const owner = playerId(player);
        activeOperations.delete(owner);
        if (openMenus.delete(owner)) ui.close(player, "Banking closed");
        return true;
    }

    async function stop(): Promise<void> {
        if (state === "stopped") return;
        state = "stopped";
        organizations.clear();
        currencies.clear();
        activeOperations.clear();
        openMenus.clear();
    }

    registerCurrency({ id: "galleons", resource: "hmp-banking", label: "Galleons", symbol: "Ⓖ", cashItem: "native:galleons" });

    return Object.freeze({
        accounts: Object.freeze({
            personal,
            organization,
            get: (id: number) => repository.getAccount(normalizeAccountId(id)),
            byNumber: (number: string) => repository.getAccount(normalizeAccountId(number)),
            list: listAccounts,
            can: async (player: Player, account: HmpBankAccount | number, permission: HmpBankPermission) => (await access(player, account, permission)).ok,
        }),
        organizations: Object.freeze({
            register: registerOrganization,
            unregister: unregisterOrganization,
            get: (id: string) => organizations.get(String(id || "").trim())?.definition || null,
            list: (resource?: string) => [...organizations.values()].map((record) => record.definition).filter((definition) => !resource || definition.resource === resource),
        }),
        currencies: Object.freeze({
            register: registerCurrency,
            unregister: unregisterCurrency,
            get: (id: string) => currencies.get(String(id || "").trim()) || null,
            list: (resource?: string) => [...currencies.values()].filter((currency) => !resource || currency.resource === resource),
        }),
        transactions: Object.freeze({
            credit,
            debit,
            transfer,
            get: (reference: string) => repository.getTransaction(normalizeReference(reference)),
            pending: (limit = 50) => repository.pending(integer(limit, 50, 1, 200)),
            reconcile,
            history: async (account: HmpBankAccount | number, limit = 50) => repository.history((await accountValue(account)).id, integer(limit, 50, 1, 200)),
        }),
        cash: Object.freeze({ deposit, withdraw }),
        providers: Object.freeze({ shops: shopsProvider }),
        ui: Object.freeze({ open, close: (player: Player) => { openMenus.delete(playerId(player)); return ui.close(player, "Banking closed"); } }),
        status: () => ({ state, lastError, organizations: organizations.size, currencies: currencies.size, activeOperations: activeOperations.size, openMenus: openMenus.size, uptimeMs: Math.min(MAX_AMOUNT, now() - startedAt) }),
        start,
        removeForResource,
        maySwitch,
        disconnect,
        stop,
    });
}

export = { createBankingService, bankError, compactReference };
