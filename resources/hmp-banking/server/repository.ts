import normalizeModule = require("../shared/normalize");
import type { HmpMySQLMigration, HmpMySQLTransaction } from "../../hmp-mysql/types";
import type { HmpBankAccount, HmpBankTransaction } from "../types";
import type { AccountOwner, BankingRepository, Database, LedgerDraft } from "./internal";

const { MAX_AMOUNT, accountNumber } = normalizeModule;

interface AccountRow {
    id: number | string;
    account_type: "personal" | "organization";
    character_id: number | string | null;
    organization_id: string | null;
    label: string;
    currency_id: string;
    balance: number | string;
    status: "active" | "frozen" | "closed";
    created_at: string | Date;
    updated_at: string | Date;
}

interface TransactionRow {
    id: number | string;
    reference_id: string;
    transaction_type: HmpBankTransaction["type"];
    actor_character_id: number | string | null;
    from_account_id: number | string | null;
    to_account_id: number | string | null;
    currency_id: string;
    amount: number | string;
    memo: string;
    metadata_json: string | null;
    source_resource: string;
    status: HmpBankTransaction["status"];
    error_text: string;
    created_at: string | Date;
    applied_at: string | Date | null;
    completed_at: string | Date | null;
}

function safeInteger(value: number | string, name: string): number {
    const numeric = Number(value);
    if (!Number.isSafeInteger(numeric) || numeric < 0) throw new Error(`${name} exceeds the JavaScript safe integer range`);
    return numeric;
}

function mapAccount(row: AccountRow): HmpBankAccount {
    const id = safeInteger(row.id, "bank account id");
    return {
        id,
        number: accountNumber(id),
        type: row.account_type,
        characterId: row.character_id === null ? null : safeInteger(row.character_id, "bank character id"),
        organizationId: row.organization_id,
        label: row.label,
        currency: row.currency_id,
        balance: safeInteger(row.balance, "bank balance"),
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function parseMetadata(raw: string | null): Record<string, unknown> {
    if (!raw) return {};
    try {
        const value: unknown = JSON.parse(raw);
        return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    } catch {
        return {};
    }
}

function mapTransaction(row: TransactionRow): HmpBankTransaction {
    return {
        id: safeInteger(row.id, "bank transaction id"),
        reference: row.reference_id,
        type: row.transaction_type,
        actorCharacterId: row.actor_character_id === null ? null : safeInteger(row.actor_character_id, "bank transaction actor"),
        fromAccountId: row.from_account_id === null ? null : safeInteger(row.from_account_id, "bank source account"),
        toAccountId: row.to_account_id === null ? null : safeInteger(row.to_account_id, "bank destination account"),
        currency: row.currency_id,
        amount: safeInteger(row.amount, "bank transaction amount"),
        memo: row.memo || "",
        metadata: parseMetadata(row.metadata_json),
        resource: row.source_resource,
        status: row.status,
        error: row.error_text || "",
        createdAt: row.created_at,
        appliedAt: row.applied_at,
        completedAt: row.completed_at,
    };
}

function createRepository(database: Database): BankingRepository {
    if (!database || typeof database.transaction !== "function") throw new TypeError("database API is required");

    async function getAccount(id: number, tx: HmpMySQLTransaction = database, lock = false): Promise<HmpBankAccount | null> {
        const row = await tx.single<AccountRow>(`SELECT * FROM hmp_bank_accounts WHERE id = ?${lock ? " FOR UPDATE" : ""}`, [id]);
        return row ? mapAccount(row) : null;
    }

    async function getTransaction(reference: string, tx: HmpMySQLTransaction = database, lock = false): Promise<HmpBankTransaction | null> {
        const row = await tx.single<TransactionRow>(`SELECT * FROM hmp_bank_transactions WHERE reference_id = ?${lock ? " FOR UPDATE" : ""}`, [reference]);
        return row ? mapTransaction(row) : null;
    }

    async function ensureAccount(owner: AccountOwner): Promise<HmpBankAccount> {
        await database.update(
            `INSERT INTO hmp_bank_accounts (account_type, character_id, organization_id, label, currency_id)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE label = VALUES(label)`,
            [owner.type, owner.characterId, owner.organizationId, owner.label, owner.currency],
        );
        const account = owner.type === "personal"
            ? await getPersonal(owner.characterId!, owner.currency)
            : await getOrganization(owner.organizationId!, owner.currency);
        if (!account) throw new Error("bank account could not be created");
        return account;
    }

    async function getPersonal(characterId: number, currency: string): Promise<HmpBankAccount | null> {
        const row = await database.single<AccountRow>(
            "SELECT * FROM hmp_bank_accounts WHERE account_type = 'personal' AND character_id = ? AND currency_id = ?",
            [characterId, currency],
        );
        return row ? mapAccount(row) : null;
    }

    async function listPersonal(characterId: number): Promise<HmpBankAccount[]> {
        const rows = await database.query<AccountRow[]>(
            "SELECT * FROM hmp_bank_accounts WHERE account_type = 'personal' AND character_id = ? ORDER BY id",
            [characterId],
        );
        return rows.map(mapAccount);
    }

    async function getOrganization(organizationId: string, currency: string): Promise<HmpBankAccount | null> {
        const row = await database.single<AccountRow>(
            "SELECT * FROM hmp_bank_accounts WHERE account_type = 'organization' AND organization_id = ? AND currency_id = ?",
            [organizationId, currency],
        );
        return row ? mapAccount(row) : null;
    }

    async function begin(draft: LedgerDraft): Promise<{ created: boolean; transaction: HmpBankTransaction }> {
        const created = (await database.update(
            `INSERT IGNORE INTO hmp_bank_transactions
                (reference_id, transaction_type, actor_character_id, from_account_id, to_account_id, currency_id, amount, memo, metadata_json, source_resource)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [draft.reference, draft.type, draft.actorCharacterId, draft.fromAccountId, draft.toAccountId, draft.currency, draft.amount, draft.memo, JSON.stringify(draft.metadata), draft.resource],
        )) > 0;
        const transaction = await getTransaction(draft.reference);
        if (!transaction) throw new Error(`bank transaction '${draft.reference}' was not found`);
        return { created, transaction };
    }

    async function lockedAccounts(transaction: HmpBankTransaction, tx: HmpMySQLTransaction): Promise<Map<number, HmpBankAccount>> {
        const ids = [...new Set([transaction.fromAccountId, transaction.toAccountId].filter((value): value is number => value !== null))].sort((a, b) => a - b);
        const accounts = new Map<number, HmpBankAccount>();
        for (const id of ids) {
            const account = await getAccount(id, tx, true);
            if (!account) throw new Error(`bank account '${accountNumber(id)}' does not exist`);
            if (account.currency !== transaction.currency) throw new Error("bank transaction currencies do not match");
            if (account.status !== "active") throw new Error(`bank account '${account.number}' is ${account.status}`);
            accounts.set(id, account);
        }
        return accounts;
    }

    async function apply(reference: string, complete = true): Promise<HmpBankTransaction> {
        return database.transaction(async (tx) => {
            const transaction = await getTransaction(reference, tx, true);
            if (!transaction) throw new Error(`bank transaction '${reference}' was not found`);
            if (transaction.status === "completed") return transaction;
            if (transaction.status !== "pending") throw new Error(`bank transaction '${reference}' is ${transaction.status}`);
            if (transaction.appliedAt) {
                if (complete) {
                    await tx.update("UPDATE hmp_bank_transactions SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE reference_id = ? AND status = 'pending'", [reference]);
                    return (await getTransaction(reference, tx, true))!;
                }
                return transaction;
            }
            const accounts = await lockedAccounts(transaction, tx);
            if (transaction.fromAccountId !== null) {
                const changed = await tx.update(
                    "UPDATE hmp_bank_accounts SET balance = balance - ? WHERE id = ? AND balance >= ? AND status = 'active'",
                    [transaction.amount, transaction.fromAccountId, transaction.amount],
                );
                if (!changed) throw Object.assign(new Error("bank account has insufficient funds"), { code: "HMP_BANK_FUNDS" });
            }
            if (transaction.toAccountId !== null) {
                const destination = accounts.get(transaction.toAccountId)!;
                const changed = await tx.update(
                    "UPDATE hmp_bank_accounts SET balance = balance + ? WHERE id = ? AND balance <= ? AND status = 'active'",
                    [transaction.amount, transaction.toAccountId, MAX_AMOUNT - destination.balance],
                );
                if (!changed) throw new Error("bank account balance would exceed the safe integer range");
            }
            await tx.update(
                complete
                    ? "UPDATE hmp_bank_transactions SET status = 'completed', applied_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP WHERE reference_id = ?"
                    : "UPDATE hmp_bank_transactions SET applied_at = CURRENT_TIMESTAMP WHERE reference_id = ?",
                [reference],
            );
            return (await getTransaction(reference, tx, true))!;
        });
    }

    async function finish(reference: string): Promise<HmpBankTransaction> {
        await database.update(
            "UPDATE hmp_bank_transactions SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE reference_id = ? AND status = 'pending' AND applied_at IS NOT NULL",
            [reference],
        );
        const transaction = await getTransaction(reference);
        if (!transaction) throw new Error(`bank transaction '${reference}' was not found`);
        if (transaction.status !== "completed") throw new Error(`bank transaction '${reference}' was not applied`);
        return transaction;
    }

    async function fail(reference: string, status: "failed" | "compensated", error = "", reverse = false): Promise<HmpBankTransaction> {
        return database.transaction(async (tx) => {
            const transaction = await getTransaction(reference, tx, true);
            if (!transaction) throw new Error(`bank transaction '${reference}' was not found`);
            if (transaction.status === "failed" || transaction.status === "compensated") return transaction;
            if (reverse && transaction.appliedAt) {
                const accounts = await lockedAccounts(transaction, tx);
                if (transaction.toAccountId !== null) {
                    const changed = await tx.update(
                        "UPDATE hmp_bank_accounts SET balance = balance - ? WHERE id = ? AND balance >= ? AND status = 'active'",
                        [transaction.amount, transaction.toAccountId, transaction.amount],
                    );
                    if (!changed) throw new Error("bank transaction compensation lacks destination funds");
                }
                if (transaction.fromAccountId !== null) {
                    const source = accounts.get(transaction.fromAccountId)!;
                    const changed = await tx.update(
                        "UPDATE hmp_bank_accounts SET balance = balance + ? WHERE id = ? AND balance <= ? AND status = 'active'",
                        [transaction.amount, transaction.fromAccountId, MAX_AMOUNT - source.balance],
                    );
                    if (!changed) throw new Error("bank transaction compensation would overflow the source account");
                }
            } else if (transaction.appliedAt) {
                throw new Error("an applied bank transaction must be reversed before it can fail");
            }
            await tx.update(
                "UPDATE hmp_bank_transactions SET status = ?, error_text = ?, completed_at = CURRENT_TIMESTAMP WHERE reference_id = ?",
                [status, error.slice(0, 191), reference],
            );
            return (await getTransaction(reference, tx, true))!;
        });
    }

    async function history(accountId: number, limit: number): Promise<HmpBankTransaction[]> {
        const bounded = Math.max(1, Math.min(200, Math.trunc(limit)));
        const rows = await database.query<TransactionRow[]>(
            `SELECT * FROM hmp_bank_transactions
             WHERE from_account_id = ? OR to_account_id = ?
             ORDER BY id DESC LIMIT ${bounded}`,
            [accountId, accountId],
        );
        return rows.map(mapTransaction);
    }

    async function pending(limit: number): Promise<HmpBankTransaction[]> {
        const bounded = Math.max(1, Math.min(200, Math.trunc(limit)));
        const rows = await database.query<TransactionRow[]>(
            `SELECT * FROM hmp_bank_transactions WHERE status = 'pending' ORDER BY id LIMIT ${bounded}`,
        );
        return rows.map(mapTransaction);
    }

    return Object.freeze({
        migrate: (migrations: HmpMySQLMigration[]) => database.migrate("hmp-banking", migrations),
        ensureAccount,
        getAccount,
        getPersonal,
        listPersonal,
        getOrganization,
        getTransaction,
        pending,
        begin,
        apply,
        finish,
        fail,
        history,
    });
}

export = { createRepository, mapAccount, mapTransaction };
