import assert = require("node:assert/strict");
import test = require("node:test");
import normalizeModule = require("../shared/normalize");
import serviceModule = require("../server/service");
import type { LedgerDraft } from "../server/internal";
import type { HmpBankAccount, HmpBankTransaction } from "../types";

const { normalizeCurrency, normalizeOrganization, amount, accountId, accountNumber } = normalizeModule;
const { createBankingService } = serviceModule;

function setup() {
    let accountSequence = 0;
    let transactionSequence = 0;
    let clock = 1_700_000_000_000;
    const accounts = new Map<number, HmpBankAccount>();
    const ownership = new Map<string, number>();
    const transactions = new Map<string, HmpBankTransaction>();
    const counts = new Map<string, number>([["native:galleons", 100]]);
    const groups = new Map<string, number>();
    const events: Array<{ name: string; payload: unknown }> = [];
    const notifications: unknown[] = [];
    const menus: unknown[] = [];
    const inputs: unknown[] = [];
    const alerts: unknown[] = [];
    const contextChoices: Array<string | null> = [];
    const inputChoices: Array<Record<string, string | number | boolean> | null> = [];
    const alertChoices: Array<"confirm" | "cancel" | null> = [];
    const failAdds = new Map<string, number>();
    const player = { id: 7, nickname: "Harry", position: { x: 0, y: 0, z: 0 }, emit() {}, teleport: () => 1 };
    const character = { id: 42, name: "Harry Potter" };

    const cloneAccount = (account: HmpBankAccount): HmpBankAccount => ({ ...account });
    const cloneTransaction = (transaction: HmpBankTransaction): HmpBankTransaction => ({ ...transaction, metadata: { ...transaction.metadata } });
    const keyOf = (owner: { type: string; characterId: number | null; organizationId: string | null; currency: string }) => `${owner.type}:${owner.characterId ?? owner.organizationId}:${owner.currency}`;

    const repository = {
        async migrate() { return { applied: [1] }; },
        async ensureAccount(owner: { type: "personal" | "organization"; characterId: number | null; organizationId: string | null; label: string; currency: string }) {
            const key = keyOf(owner);
            const currentId = ownership.get(key);
            if (currentId) {
                const current = accounts.get(currentId)!;
                current.label = owner.label;
                current.updatedAt = new Date(clock);
                return cloneAccount(current);
            }
            const id = ++accountSequence;
            const created: HmpBankAccount = {
                id,
                number: accountNumber(id),
                type: owner.type,
                characterId: owner.characterId,
                organizationId: owner.organizationId,
                label: owner.label,
                currency: owner.currency,
                balance: 0,
                status: "active",
                createdAt: new Date(clock),
                updatedAt: new Date(clock),
            };
            accounts.set(id, created);
            ownership.set(key, id);
            return cloneAccount(created);
        },
        async getAccount(id: number) { return accounts.has(id) ? cloneAccount(accounts.get(id)!) : null; },
        async getPersonal(characterId: number, currency: string) {
            const id = ownership.get(`personal:${characterId}:${currency}`);
            return id ? cloneAccount(accounts.get(id)!) : null;
        },
        async listPersonal(characterId: number) {
            return [...accounts.values()].filter((account) => account.type === "personal" && account.characterId === characterId).map(cloneAccount);
        },
        async getOrganization(organizationId: string, currency: string) {
            const id = ownership.get(`organization:${organizationId}:${currency}`);
            return id ? cloneAccount(accounts.get(id)!) : null;
        },
        async getTransaction(reference: string) {
            return transactions.has(reference) ? cloneTransaction(transactions.get(reference)!) : null;
        },
        async pending(limit: number) {
            return [...transactions.values()].filter((entry) => entry.status === "pending").slice(0, limit).map(cloneTransaction);
        },
        async begin(draft: LedgerDraft) {
            const existing = transactions.get(draft.reference);
            if (existing) return { created: false, transaction: cloneTransaction(existing) };
            const created: HmpBankTransaction = {
                id: ++transactionSequence,
                reference: draft.reference,
                type: draft.type,
                actorCharacterId: draft.actorCharacterId,
                fromAccountId: draft.fromAccountId,
                toAccountId: draft.toAccountId,
                currency: draft.currency,
                amount: draft.amount,
                memo: draft.memo,
                metadata: { ...draft.metadata },
                resource: draft.resource,
                status: "pending",
                error: "",
                createdAt: new Date(clock),
                appliedAt: null,
                completedAt: null,
            };
            transactions.set(draft.reference, created);
            return { created: true, transaction: cloneTransaction(created) };
        },
        async apply(reference: string, complete = true) {
            const transaction = transactions.get(reference)!;
            if (transaction.status === "completed") return cloneTransaction(transaction);
            if (transaction.status !== "pending") throw new Error(`transaction is ${transaction.status}`);
            if (!transaction.appliedAt) {
                if (transaction.fromAccountId !== null) {
                    const source = accounts.get(transaction.fromAccountId)!;
                    if (source.balance < transaction.amount) throw Object.assign(new Error("bank account has insufficient funds"), { code: "HMP_BANK_FUNDS" });
                    source.balance -= transaction.amount;
                }
                if (transaction.toAccountId !== null) accounts.get(transaction.toAccountId)!.balance += transaction.amount;
                transaction.appliedAt = new Date(clock);
            }
            if (complete) { transaction.status = "completed"; transaction.completedAt = new Date(clock); }
            return cloneTransaction(transaction);
        },
        async finish(reference: string) {
            const transaction = transactions.get(reference)!;
            if (!transaction.appliedAt) throw new Error("not applied");
            transaction.status = "completed";
            transaction.completedAt = new Date(clock);
            return cloneTransaction(transaction);
        },
        async fail(reference: string, status: "failed" | "compensated", error = "", reverse = false) {
            const transaction = transactions.get(reference)!;
            if (reverse && transaction.appliedAt) {
                if (transaction.toAccountId !== null) accounts.get(transaction.toAccountId)!.balance -= transaction.amount;
                if (transaction.fromAccountId !== null) accounts.get(transaction.fromAccountId)!.balance += transaction.amount;
            }
            transaction.status = status;
            transaction.error = error;
            transaction.completedAt = new Date(clock);
            return cloneTransaction(transaction);
        },
        async history(accountId: number, limit: number) {
            return [...transactions.values()].filter((entry) => entry.fromAccountId === accountId || entry.toAccountId === accountId).slice(-limit).reverse().map(cloneTransaction);
        },
    };

    const service = createBankingService({
        repository: repository as never,
        core: {
            characters: { active: (target: unknown) => target === player ? character : null },
            groups: { has: async (_target: unknown, key: string, minimum = 0) => (groups.get(key) ?? -Infinity) >= minimum },
        } as never,
        inventory: {
            items: { get: (name: string) => name === "native:galleons" ? { name, label: "Galleons" } : null },
            inventory: {
                count: async (_target: unknown, name: string) => counts.get(name) || 0,
                has: async (_target: unknown, name: string, requested: number) => (counts.get(name) || 0) >= requested,
                async add(_target: unknown, name: string, requested: number) {
                    const failures = failAdds.get(name) || 0;
                    if (failures > 0) { failAdds.set(name, failures - 1); throw new Error(`failed to add ${name}`); }
                    counts.set(name, (counts.get(name) || 0) + requested);
                    return requested;
                },
                async remove(_target: unknown, name: string, requested: number) {
                    const current = counts.get(name) || 0;
                    if (current < requested) throw new Error(`not enough ${name}`);
                    counts.set(name, current - requested);
                    return requested;
                },
            },
        } as never,
        ui: {
            notify(_player: unknown, value: unknown) { notifications.push(value); return true; },
            close() { return true; },
            async context(_player: unknown, value: unknown) { menus.push(value); return contextChoices.shift() ?? null; },
            async input(_player: unknown, value: unknown) { inputs.push(value); return inputChoices.shift() ?? null; },
            async alert(_player: unknown, value: unknown) { alerts.push(value); return alertChoices.shift() ?? null; },
        } as never,
        events: { emit(name: string, payload: unknown) { events.push({ name, payload }); } },
        logger: { info: () => true, warn: () => true, error: () => true },
        migrations: [],
        now: () => clock,
    });

    return {
        service, player, character, accounts, transactions, counts, groups, events, notifications, menus, inputs, alerts,
        contextChoices, inputChoices, alertChoices,
        failAdd(name: string, times = 1) { failAdds.set(name, times); },
        advance(ms: number) { clock += ms; },
    };
}

test("normalizes currencies, organizations, amounts and public account numbers", () => {
    assert.strictEqual(normalizeCurrency({ id: "galleons", resource: "economy", label: "Galleons" }).id, "galleons");
    assert.strictEqual(normalizeOrganization({ id: "ministry", resource: "jobs", label: "Ministry", rules: [{ group: "job:auror", permissions: ["view", "transfer"] }] }).rules?.length, 1);
    assert.strictEqual(amount(25), 25);
    assert.throws(() => amount(1.5), /positive safe integer/);
    assert.strictEqual(accountId(accountNumber(12345)), 12345);
    assert.throws(() => accountId("not-an-account"), /invalid/);
});

test("creates one character account and gates organization accounts by groups", async () => {
    const state = setup();
    await state.service.start();
    const personal = await state.service.accounts.personal(state.player);
    assert.strictEqual(personal.characterId, 42);
    assert.strictEqual((await state.service.accounts.personal(state.player)).id, personal.id);
    const dispose = state.service.organizations.register({
        id: "ministry",
        resource: "hmp-jobs",
        label: "Ministry of Magic",
        rules: [{ group: "job:auror", minimumGrade: 2, permissions: ["view", "transfer"] }],
    });
    await Promise.resolve();
    assert.strictEqual((await state.service.accounts.list(state.player)).length, 1);
    state.groups.set("job:auror", 2);
    assert.strictEqual((await state.service.accounts.list(state.player)).length, 2);
    assert.strictEqual(await state.service.accounts.can(state.player, (await state.service.accounts.organization("ministry"))!, "withdraw"), false);
    assert.strictEqual(dispose(), true);
    assert.strictEqual(dispose(), false);
});

test("credits, debits and transfers atomically with completed-reference replay", async () => {
    const state = setup();
    await state.service.start();
    const first = await state.service.accounts.personal(state.player);
    state.service.organizations.register({ id: "school", resource: "school", label: "Hogwarts", allow: async () => true });
    const second = (await state.service.accounts.organization("school"))!;
    const credited = await state.service.transactions.credit(first, 100, { resource: "test", reference: "salary-1", actor: state.player });
    assert.strictEqual(credited.status, "completed");
    const replay = await state.service.transactions.credit(first, 100, { resource: "test", reference: "salary-1", actor: state.player });
    assert.strictEqual(replay.id, credited.id);
    await state.service.transactions.transfer(first, second, 35, { resource: "test", reference: "transfer-1", actor: state.player, memo: "Dues" });
    assert.strictEqual((await state.service.accounts.get(first.id))?.balance, 65);
    assert.strictEqual((await state.service.accounts.get(second.id))?.balance, 35);
    await state.service.transactions.debit(first, 5, { resource: "test", reference: "fee-1" });
    assert.strictEqual((await state.service.accounts.get(first.id))?.balance, 60);
    assert.strictEqual((await state.service.transactions.history(first)).length, 3);
});

test("rejects insufficient debits and mismatched idempotency replays", async () => {
    const state = setup();
    const account = await state.service.accounts.personal(state.player);
    await assert.rejects(state.service.transactions.debit(account, 1, { resource: "test", reference: "empty" }), /insufficient funds/);
    assert.strictEqual(state.transactions.get("empty")?.status, "failed");
    await state.service.transactions.credit(account, 10, { resource: "test", reference: "once" });
    await assert.rejects(state.service.transactions.credit(account, 11, { resource: "test", reference: "once" }), /different operation/);
    assert.strictEqual((await state.service.accounts.get(account.id))?.balance, 10);
});

test("exchanges native Galleons for bank balance in both directions", async () => {
    const state = setup();
    const account = await state.service.accounts.personal(state.player);
    const deposited = await state.service.cash.deposit(state.player, account, 40, { reference: "cash-in" });
    assert.strictEqual(deposited.status, "completed");
    assert.strictEqual(state.counts.get("native:galleons"), 60);
    assert.strictEqual((await state.service.accounts.get(account.id))?.balance, 40);
    const withdrawn = await state.service.cash.withdraw(state.player, account, 15, { reference: "cash-out" });
    assert.strictEqual(withdrawn.status, "completed");
    assert.strictEqual(state.counts.get("native:galleons"), 75);
    assert.strictEqual((await state.service.accounts.get(account.id))?.balance, 25);
});

test("compensates a withdrawal when native cash delivery fails", async () => {
    const state = setup();
    const account = await state.service.accounts.personal(state.player);
    await state.service.transactions.credit(account, 50, { resource: "test", reference: "fund" });
    state.failAdd("native:galleons");
    await assert.rejects(state.service.cash.withdraw(state.player, account, 20, { reference: "delivery-fails" }), /failed to add/);
    assert.strictEqual((await state.service.accounts.get(account.id))?.balance, 50);
    assert.strictEqual(state.transactions.get("delivery-fails")?.status, "compensated");
});

test("provides an idempotent hmp-shops currency adapter", async () => {
    const state = setup();
    const provider = state.service.providers.shops({ resource: "economy", currency: "galleons" });
    assert.strictEqual(provider.id, "bank-galleons");
    assert.strictEqual(await provider.credit(state.player, 30, { reference: "sale:1" }), true);
    assert.strictEqual(await provider.credit(state.player, 30, { reference: "sale:1" }), true);
    assert.strictEqual(await provider.balance(state.player), 30);
    assert.strictEqual(await provider.debit(state.player, 12, { reference: "buy:1" }), true);
    assert.strictEqual(await provider.debit(state.player, 50, { reference: "buy:2" }), false);
    assert.strictEqual(await provider.balance(state.player), 18);
});

test("exposes explicit operator recovery for pending cross-system rows", async () => {
    const state = setup();
    const account = await state.service.accounts.personal(state.player);
    state.transactions.set("recover-me", {
        id: 99,
        reference: "recover-me",
        type: "deposit",
        actorCharacterId: 42,
        fromAccountId: null,
        toAccountId: account.id,
        currency: "galleons",
        amount: 9,
        memo: "",
        metadata: {},
        resource: "hmp-banking",
        status: "pending",
        error: "",
        createdAt: new Date(),
        appliedAt: null,
        completedAt: null,
    });
    assert.strictEqual((await state.service.transactions.pending()).length, 1);
    const recovered = await state.service.transactions.reconcile("recover-me", "complete");
    assert.strictEqual(recovered.status, "completed");
    assert.strictEqual((await state.service.accounts.get(account.id))?.balance, 9);
});

test("drives a transfer using only server-resolved account numbers and balances", async () => {
    const state = setup();
    const source = await state.service.accounts.personal(state.player);
    state.service.organizations.register({ id: "recipient", resource: "test", label: "Recipient", allow: async () => true });
    const destination = (await state.service.accounts.organization("recipient"))!;
    await state.service.transactions.credit(source, 25, { resource: "test", reference: "ui-fund" });
    state.contextChoices.push(String(source.id), "transfer");
    state.inputChoices.push({ account: destination.number, amount: 10, memo: "Supplies" });
    state.alertChoices.push("confirm");
    const transaction = await state.service.ui.open(state.player);
    assert.strictEqual(transaction?.status, "completed");
    assert.strictEqual((await state.service.accounts.get(source.id))?.balance, 15);
    assert.strictEqual((await state.service.accounts.get(destination.id))?.balance, 10);
    assert.strictEqual(state.inputs.length, 1);
    assert.strictEqual(state.alerts.length, 1);
    assert.ok(state.notifications.some((entry) => JSON.stringify(entry).includes("Transferred")));
});
