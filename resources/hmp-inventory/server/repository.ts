import type { HmpMySQLTransaction } from "../../hmp-mysql/types";
import type { ContainerSpec, Database, InventoryContainer, InventoryItemRow, Repository } from "./internal";

interface ContainerDatabaseRow {
    id: number | string;
    container_key: string;
    owner_character_id: number | string | null;
    label: string;
    slots: number | string;
    max_weight: number | string;
    metadata_json: unknown;
}

interface ItemDatabaseRow {
    slot: number | string;
    item_name: string;
    amount: number | string;
    metadata_json: unknown;
}

function parseJson<T>(value: unknown, fallback: T): T {
    if (value === null || value === undefined || value === "") return fallback;
    try { return JSON.parse(String(value)) as T; }
    catch (_) { return fallback; }
}

function mapContainer(row: ContainerDatabaseRow | null, rows: ItemDatabaseRow[] = []): InventoryContainer | null {
    if (!row) return null;
    return {
        id: Number(row.id),
        key: row.container_key,
        characterId: row.owner_character_id === null ? null : Number(row.owner_character_id),
        label: row.label,
        slots: Number(row.slots),
        maxWeight: Number(row.max_weight),
        metadata: parseJson(row.metadata_json, {}),
        items: rows.map((item) => ({
            slot: Number(item.slot),
            name: item.item_name,
            amount: Number(item.amount),
            metadata: parseJson(item.metadata_json, {}),
        })),
    };
}

function createRepository(database: Database): Repository {
    if (!database || typeof database.transaction !== "function") throw new TypeError("database API is required");

    async function ensureContainer(spec: ContainerSpec): Promise<InventoryContainer> {
        await database.update(
            `INSERT INTO hmp_inventory_containers
                (container_key, owner_character_id, label, slots, max_weight, metadata_json)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE container_key = VALUES(container_key)`,
            [spec.key, spec.characterId ?? null, spec.label, spec.slots, spec.maxWeight, JSON.stringify(spec.metadata || {})],
        );
        const container = await getContainer(spec.key);
        if (!container) throw new Error(`inventory container '${spec.key}' was not created`);
        return container;
    }

    async function getContainer(key: string): Promise<InventoryContainer | null> {
        const row = await database.single<ContainerDatabaseRow>("SELECT * FROM hmp_inventory_containers WHERE container_key = ?", [key]);
        if (!row) return null;
        const items = await database.query<ItemDatabaseRow[]>("SELECT slot, item_name, amount, metadata_json FROM hmp_inventory_items WHERE container_id = ? ORDER BY slot", [row.id]);
        return mapContainer(row, items);
    }

    async function mutateContainer<T>(key: string, work: (container: InventoryContainer) => T | Promise<T>): Promise<{ container: InventoryContainer; result: T }> {
        return database.transaction(async (tx: HmpMySQLTransaction) => {
            const row = await tx.single<ContainerDatabaseRow>("SELECT * FROM hmp_inventory_containers WHERE container_key = ? FOR UPDATE", [key]);
            if (!row) {
                const error = new Error(`inventory container '${key}' does not exist`);
                Object.assign(error, { code: "HMP_INVENTORY_CONTAINER_NOT_FOUND" });
                throw error;
            }
            const itemRows = await tx.query<ItemDatabaseRow[]>(
                "SELECT slot, item_name, amount, metadata_json FROM hmp_inventory_items WHERE container_id = ? ORDER BY slot FOR UPDATE",
                [row.id],
            );
            const container = mapContainer(row, itemRows);
            if (!container) throw new Error(`inventory container '${key}' could not be mapped`);
            const result = await work(container);
            await tx.update("DELETE FROM hmp_inventory_items WHERE container_id = ?", [container.id]);
            for (const item of container.items.sort((left, right) => left.slot - right.slot)) {
                await tx.insert(
                    "INSERT INTO hmp_inventory_items (container_id, slot, item_name, amount, metadata_json) VALUES (?, ?, ?, ?, ?)",
                    [container.id, item.slot, item.name, item.amount, JSON.stringify(item.metadata || {})],
                );
            }
            return { container, result };
        });
    }

    async function mutateContainers<T>(keys: string[], work: (containers: Map<string, InventoryContainer>) => T | Promise<T>): Promise<{ containers: InventoryContainer[]; result: T }> {
        const wanted = [...new Set(keys.map((key) => String(key)))].sort();
        if (wanted.length < 2) throw new TypeError("at least two different inventory containers are required");
        return database.transaction(async (tx: HmpMySQLTransaction) => {
            const containers = new Map<string, InventoryContainer>();
            const rows = new Map<string, ContainerDatabaseRow>();
            // Lock container records in stable key order before touching item rows to avoid inverse-transfer deadlocks.
            for (const key of wanted) {
                const row = await tx.single<ContainerDatabaseRow>("SELECT * FROM hmp_inventory_containers WHERE container_key = ? FOR UPDATE", [key]);
                if (!row) {
                    const error = new Error(`inventory container '${key}' does not exist`);
                    Object.assign(error, { code: "HMP_INVENTORY_CONTAINER_NOT_FOUND" });
                    throw error;
                }
                rows.set(key, row);
            }
            for (const key of wanted) {
                const row = rows.get(key) as ContainerDatabaseRow;
                const itemRows = await tx.query<ItemDatabaseRow[]>(
                    "SELECT slot, item_name, amount, metadata_json FROM hmp_inventory_items WHERE container_id = ? ORDER BY slot FOR UPDATE",
                    [row.id],
                );
                const container = mapContainer(row, itemRows);
                if (!container) throw new Error(`inventory container '${key}' could not be mapped`);
                containers.set(key, container);
            }
            const result = await work(containers);
            for (const key of wanted) {
                const container = containers.get(key) as InventoryContainer;
                await tx.update("DELETE FROM hmp_inventory_items WHERE container_id = ?", [container.id]);
                for (const item of container.items.sort((left, right) => left.slot - right.slot)) {
                    await tx.insert(
                        "INSERT INTO hmp_inventory_items (container_id, slot, item_name, amount, metadata_json) VALUES (?, ?, ?, ?, ?)",
                        [container.id, item.slot, item.name, item.amount, JSON.stringify(item.metadata || {})],
                    );
                }
            }
            return { containers: wanted.map((key) => containers.get(key) as InventoryContainer), result };
        });
    }

    async function createNamedContainer(spec: ContainerSpec): Promise<InventoryContainer> {
        return ensureContainer({ ...spec, characterId: spec.characterId ?? null });
    }

    async function deleteContainer(key: string): Promise<boolean> {
        return (await database.update(
            "DELETE FROM hmp_inventory_containers WHERE container_key = ? AND owner_character_id IS NULL",
            [key],
        )) > 0;
    }

    async function loadNative(characterId: number): Promise<unknown> {
        const raw = await database.scalar("SELECT items_json FROM hmp_inventory_native WHERE character_id = ?", [characterId]);
        return parseJson(raw, []);
    }

    async function saveNative(characterId: number, rows: import("../types").HmpNativeInventoryRow[]) {
        await database.update(
            `INSERT INTO hmp_inventory_native (character_id, items_json) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE items_json = VALUES(items_json)`,
            [characterId, JSON.stringify(rows)],
        );
        return rows;
    }

    return Object.freeze({ ensureContainer, createNamedContainer, getContainer, mutateContainer, mutateContainers, deleteContainer, loadNative, saveNative });
}

export = { createRepository };
// TypeScript source.
