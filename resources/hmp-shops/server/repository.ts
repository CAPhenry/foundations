import type { HmpMySQLTransaction } from "../../hmp-mysql/types";
import type { HmpMySQLMigration } from "../../hmp-mysql/types";
import type { HmpShopTransaction } from "../types";
import type { Database, ShopsRepository, TransactionDraft } from "./internal";

interface TransactionRow {
    id: number | string;
    reference_id: string;
    character_id: number | string;
    shop_id: string;
    offer_id: string;
    item_name: string;
    direction: "buy" | "sell";
    quantity: number | string;
    unit_price: number | string;
    total_price: number | string;
    currency_id: string;
    status: HmpShopTransaction["status"];
    error_text: string;
    created_at: string | Date;
    completed_at: string | Date | null;
}

function mapTransaction(row: TransactionRow): HmpShopTransaction {
    return {
        id: Number(row.id),
        reference: row.reference_id,
        characterId: Number(row.character_id),
        shopId: row.shop_id,
        offerId: row.offer_id,
        item: row.item_name,
        direction: row.direction,
        quantity: Number(row.quantity),
        unitPrice: Number(row.unit_price),
        totalPrice: Number(row.total_price),
        currency: row.currency_id,
        status: row.status,
        error: row.error_text || "",
        createdAt: row.created_at,
        completedAt: row.completed_at,
    };
}

function createRepository(database: Database): ShopsRepository {
    if (!database || typeof database.transaction !== "function") throw new TypeError("database API is required");

    async function transaction(reference: string, tx: HmpMySQLTransaction = database): Promise<HmpShopTransaction> {
        const row = await tx.single<TransactionRow>("SELECT * FROM hmp_shop_transactions WHERE reference_id = ?", [reference]);
        if (!row) throw new Error(`shop transaction '${reference}' was not found`);
        return mapTransaction(row);
    }

    async function ensureStock(shopId: string, offerId: string, quantity: number): Promise<number> {
        await database.update(
            "INSERT IGNORE INTO hmp_shop_stock (shop_id, offer_id, quantity) VALUES (?, ?, ?)",
            [shopId, offerId, quantity],
        );
        return Number(await database.scalar("SELECT quantity FROM hmp_shop_stock WHERE shop_id = ? AND offer_id = ?", [shopId, offerId]) || 0);
    }

    async function getStock(shopId: string, offerId: string): Promise<number | null> {
        const value = await database.scalar<number | string>("SELECT quantity FROM hmp_shop_stock WHERE shop_id = ? AND offer_id = ?", [shopId, offerId]);
        return value === null || value === undefined ? null : Number(value);
    }

    async function reserveStock(shopId: string, offerId: string, quantity: number): Promise<boolean> {
        return (await database.update(
            "UPDATE hmp_shop_stock SET quantity = quantity - ? WHERE shop_id = ? AND offer_id = ? AND quantity >= ?",
            [quantity, shopId, offerId, quantity],
        )) > 0;
    }

    async function adjustStock(shopId: string, offerId: string, delta: number): Promise<number> {
        return database.transaction(async (tx) => {
            const changed = delta < 0
                ? await tx.update(
                    "UPDATE hmp_shop_stock SET quantity = quantity - ? WHERE shop_id = ? AND offer_id = ? AND quantity >= ?",
                    [-delta, shopId, offerId, -delta],
                )
                : await tx.update(
                    "UPDATE hmp_shop_stock SET quantity = quantity + ? WHERE shop_id = ? AND offer_id = ?",
                    [delta, shopId, offerId],
                );
            if (!changed) throw Object.assign(new Error("shop stock is unavailable or would become negative"), { code: "HMP_SHOP_STOCK" });
            return Number(await tx.scalar("SELECT quantity FROM hmp_shop_stock WHERE shop_id = ? AND offer_id = ?", [shopId, offerId]) || 0);
        });
    }

    async function setStock(shopId: string, offerId: string, quantity: number): Promise<number> {
        await database.update(
            `INSERT INTO hmp_shop_stock (shop_id, offer_id, quantity) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`,
            [shopId, offerId, quantity],
        );
        return quantity;
    }

    async function begin(draft: TransactionDraft): Promise<{ created: boolean; transaction: HmpShopTransaction }> {
        const created = (await database.update(
            `INSERT IGNORE INTO hmp_shop_transactions
                (reference_id, character_id, shop_id, offer_id, item_name, direction, quantity, unit_price, total_price, currency_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [draft.reference, draft.characterId, draft.shopId, draft.offerId, draft.item, draft.direction, draft.quantity, draft.unitPrice, draft.totalPrice, draft.currency],
        )) > 0;
        return { created, transaction: await transaction(draft.reference) };
    }

    async function finish(reference: string, status: HmpShopTransaction["status"], error = ""): Promise<HmpShopTransaction> {
        await database.update(
            "UPDATE hmp_shop_transactions SET status = ?, error_text = ?, completed_at = CURRENT_TIMESTAMP WHERE reference_id = ?",
            [status, error.slice(0, 191), reference],
        );
        return transaction(reference);
    }

    async function history(characterId: number, limit: number): Promise<HmpShopTransaction[]> {
        const rows = await database.query<TransactionRow[]>(
            `SELECT * FROM hmp_shop_transactions WHERE character_id = ? ORDER BY id DESC LIMIT ${Math.max(1, Math.min(200, Math.trunc(limit)))}`,
            [characterId],
        );
        return rows.map(mapTransaction);
    }

    return Object.freeze({
        migrate: (migrations: HmpMySQLMigration[]) => database.migrate("hmp-shops", migrations),
        ensureStock,
        getStock,
        reserveStock,
        adjustStock,
        setStock,
        begin,
        finish,
        history,
    });
}

export = { createRepository, mapTransaction };
