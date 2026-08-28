import type {
    HmpInventoryContainerTarget,
    HmpInventoryTransferRequest,
    HmpInventoryTransferResult,
} from "../types";
import type {
    Character,
    Core,
    InventoryConfig,
    InventoryContainer,
    InventoryEvents,
    InventoryItemRow,
    Player,
    Registry,
    Repository,
    TransferService,
} from "./internal";

interface ResolvedTarget {
    key: string;
    player: Player | null;
    character: Character | null;
}

function transferError(code: string, message: string): Error & { code: string } {
    return Object.assign(new Error(message), { code });
}

function stableJson(value: unknown): string {
    if (!value || typeof value !== "object") return "{}";
    const sort = (entry: unknown): unknown => Array.isArray(entry)
        ? entry.map(sort)
        : entry && typeof entry === "object"
            ? Object.fromEntries(Object.keys(entry).sort().map((key) => [key, sort((entry as Record<string, unknown>)[key])]))
            : entry;
    return JSON.stringify(sort(value));
}

function createTransferService(options: {
    repository: Repository;
    registry: Registry;
    core: Core;
    events: InventoryEvents;
    config: InventoryConfig;
}): TransferService {
    const { repository, registry, core, events, config } = options;
    const characterKey = (id: number) => `character:${Number(id)}`;

    async function resolve(target: HmpInventoryContainerTarget<Player>): Promise<ResolvedTarget> {
        if (typeof target === "string") {
            const key = target.trim().toLowerCase();
            if (!key) throw new TypeError("a named inventory container key is required");
            if (!await repository.getContainer(key)) throw transferError("HMP_INVENTORY_CONTAINER_NOT_FOUND", `Inventory container '${key}' does not exist`);
            return { key, player: null, character: null };
        }
        if (target && typeof target === "object") {
            const character = core.characters.active(target);
            if (!character) throw transferError("HMP_INVENTORY_NO_CHARACTER", "No character is active");
            await repository.ensureContainer({
                key: characterKey(character.id), characterId: character.id, label: "Inventory",
                slots: config.slots, maxWeight: config.maxWeight, metadata: { kind: "character" },
            });
            return { key: characterKey(character.id), player: target, character };
        }
        const characterId = Math.trunc(Number(target));
        if (!Number.isSafeInteger(characterId) || characterId <= 0) throw new TypeError("a player, character id, or container key is required");
        const character = { id: characterId };
        await repository.ensureContainer({
            key: characterKey(characterId), characterId, label: "Inventory",
            slots: config.slots, maxWeight: config.maxWeight, metadata: { kind: "character" },
        });
        return { key: characterKey(characterId), player: null, character };
    }

    function weightOf(container: InventoryContainer): number {
        return container.items.reduce((total, row) => total + (registry.get(row.name)?.weight || 0) * row.amount, 0);
    }

    function place(container: InventoryContainer, source: InventoryItemRow, amount: number, preferredSlot?: number): void {
        const definition = registry.get(source.name);
        if (!definition) throw transferError("HMP_INVENTORY_ITEM_UNKNOWN", `Unknown item '${source.name}'`);
        const metadataKey = stableJson(source.metadata);
        let left = amount;
        if (preferredSlot !== undefined) {
            if (preferredSlot < 1 || preferredSlot > container.slots) throw transferError("HMP_INVENTORY_SLOT_INVALID", "The destination slot is outside that container");
            const preferred = container.items.find((row) => row.slot === preferredSlot);
            if (preferred) {
                const compatible = !definition.unique
                    && preferred.name === source.name
                    && stableJson(preferred.metadata) === metadataKey
                    && preferred.amount < definition.maxStack;
                if (!compatible) throw transferError("HMP_INVENTORY_SLOT_OCCUPIED", "The destination slot contains a different or full stack");
                const moved = Math.min(left, definition.maxStack - preferred.amount);
                preferred.amount += moved;
                left -= moved;
            }
            else {
                const moved = definition.unique ? 1 : Math.min(left, definition.maxStack);
                container.items.push({ slot: preferredSlot, name: source.name, amount: moved, metadata: { ...source.metadata } });
                left -= moved;
            }
            preferredSlot = undefined;
        }
        if (!definition.unique) {
            for (const row of [...container.items].sort((a, b) => a.slot - b.slot)) {
                if (!left) break;
                if (row.slot === preferredSlot || row.name !== source.name || stableJson(row.metadata) !== metadataKey || row.amount >= definition.maxStack) continue;
                const moved = Math.min(left, definition.maxStack - row.amount);
                row.amount += moved;
                left -= moved;
            }
        }
        while (left > 0) {
            const occupied = new Set(container.items.map((row) => row.slot));
            let slot = 1;
            while (occupied.has(slot) && slot <= container.slots) slot++;
            if (slot > container.slots) throw transferError("HMP_INVENTORY_FULL", "The destination does not have enough inventory slots");
            const moved = definition.unique ? 1 : Math.min(left, definition.maxStack);
            container.items.push({ slot, name: source.name, amount: moved, metadata: { ...source.metadata } });
            left -= moved;
        }
        if (container.maxWeight > 0 && weightOf(container) > container.maxWeight + Number.EPSILON) {
            throw transferError("HMP_INVENTORY_OVERWEIGHT", "The destination cannot carry that much weight");
        }
    }

    async function move(request: HmpInventoryTransferRequest<Player>): Promise<HmpInventoryTransferResult> {
        if (!request || typeof request !== "object") throw new TypeError("an inventory transfer request is required");
        const [from, to] = await Promise.all([resolve(request.from), resolve(request.to)]);
        if (from.key === to.key) throw transferError("HMP_INVENTORY_SAME_CONTAINER", "Source and destination must be different containers");
        const fromSlot = Math.trunc(Number(request.fromSlot));
        if (!Number.isSafeInteger(fromSlot) || fromSlot < 1) throw new TypeError("fromSlot must be a positive integer");
        const requestedAmount = request.amount === undefined ? null : Math.trunc(Number(request.amount));
        if (requestedAmount !== null && (!Number.isSafeInteger(requestedAmount) || requestedAmount <= 0)) throw new TypeError("amount must be a positive integer");
        const toSlot = request.toSlot === undefined ? undefined : Math.trunc(Number(request.toSlot));
        if (toSlot !== undefined && (!Number.isSafeInteger(toSlot) || toSlot < 1)) throw new TypeError("toSlot must be a positive integer");

        const mutation = await repository.mutateContainers([from.key, to.key], (containers) => {
            const sourceContainer = containers.get(from.key) as InventoryContainer;
            const destinationContainer = containers.get(to.key) as InventoryContainer;
            const source = sourceContainer.items.find((row) => row.slot === fromSlot);
            if (!source) throw transferError("HMP_INVENTORY_SLOT_EMPTY", "The source slot is empty");
            const definition = registry.get(source.name);
            if (!definition) throw transferError("HMP_INVENTORY_ITEM_UNKNOWN", `Unknown item '${source.name}'`);
            if (definition.native) {
                throw transferError("HMP_INVENTORY_NATIVE_TRANSFER_UNSUPPORTED", "Native game items cannot cross a database-container boundary without a recovery journal");
            }
            const amount = requestedAmount ?? source.amount;
            if (amount > source.amount) throw transferError("HMP_INVENTORY_NOT_ENOUGH", `The source stack contains only ${source.amount}`);
            place(destinationContainer, source, amount, toSlot);
            source.amount -= amount;
            if (source.amount === 0) sourceContainer.items.splice(sourceContainer.items.indexOf(source), 1);
            return { item: source.name, amount, metadata: { ...source.metadata } };
        });
        const sourceContainer = mutation.containers.find((container) => container.key === from.key) as InventoryContainer;
        const destinationContainer = mutation.containers.find((container) => container.key === to.key) as InventoryContainer;
        const result: HmpInventoryTransferResult = {
            ...mutation.result,
            from: sourceContainer,
            to: destinationContainer,
        };
        const payload = { ...result, from: { ...from, container: sourceContainer }, to: { ...to, container: destinationContainer } };
        const notify = (name: string, value: unknown) => Promise.resolve().then(() => events.emit(name, value)).catch(() => undefined);
        const notifications: Promise<unknown>[] = [];
        if (from.player) notifications.push(notify("hmp:inventory:changed", { player: from.player, character: from.character, action: "transfer-out", source: "custom", transfer: result, container: sourceContainer }));
        if (to.player) notifications.push(notify("hmp:inventory:changed", { player: to.player, character: to.character, action: "transfer-in", source: "custom", transfer: result, container: destinationContainer }));
        notifications.push(notify("hmp:inventory:transferred", payload));
        // The database commit is already authoritative; listener failures must not make callers retry it.
        await Promise.allSettled(notifications);
        return result;
    }

    return Object.freeze({ move });
}

export = { createTransferService };
