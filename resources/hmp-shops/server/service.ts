import normalizeModule = require("../shared/normalize");
import type { HmpInteractionRequirements } from "../../hmp-interact/types";
import type {
    HmpShopAccessContext,
    HmpShopCurrencyContext,
    HmpShopCurrencyProvider,
    HmpShopDefinition,
    HmpShopOffer,
    HmpShopRequirements,
    HmpShopTransaction,
    HmpShopTransactionOptions,
} from "../types";
import type { Player, ShopsDependencies, ShopsService } from "./internal";

const { clean, id: normalizeId, integer, normalizeShop, normalizeCurrency } = normalizeModule;

interface ShopRecord {
    definition: HmpShopDefinition<Player>;
    disposeInteraction: (() => boolean) | null;
    ready: Promise<void>;
}

interface GateResult {
    ok: boolean;
    reason: string;
}

function shopError(code: string, message: string): Error {
    return Object.assign(new Error(message), { code });
}

function messageOf(error: unknown): string {
    return clean(error instanceof Error ? error.message : String(error), 191) || "unknown error";
}

function referenceValue(raw: unknown): string {
    const value = String(raw || "").trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/.test(value)) throw new TypeError("shop transaction reference is invalid");
    return value;
}

function createShopsService(dependencies: ShopsDependencies): ShopsService {
    const { repository, core, inventory, interact, ui, events, logger, migrations } = dependencies;
    const now = dependencies.now || Date.now;
    const startedAt = now();
    const shops = new Map<string, ShopRecord>();
    const currencies = new Map<string, HmpShopCurrencyProvider<Player>>();
    const activeTransactions = new Set<number>();
    const openPlayers = new Set<number>();
    let sequence = 0;
    let state: "starting" | "ready" | "degraded" | "stopped" = "starting";
    let lastError = "";
    let startPromise: Promise<void> | null = null;

    function playerId(player: Player): number {
        const value = Number(player?.id);
        if (!Number.isSafeInteger(value) || value < 0 || typeof player?.emit !== "function") throw new TypeError("a connected player is required");
        return value;
    }

    function characterOf(player: Player) {
        const character = core.characters.active(player);
        if (!character) throw shopError("HMP_SHOP_CHARACTER", "Select a character before using a shop.");
        return character;
    }

    async function gate(requirements: HmpShopRequirements<Player> | undefined, context: HmpShopAccessContext<Player>): Promise<GateResult> {
        if (!requirements) return { ok: true, reason: "" };
        if (requirements.character && !context.character) return { ok: false, reason: "Select a character first." };
        const groups = requirements.groups || [];
        if (groups.length) {
            const results = await Promise.all(groups.map((entry) => core.groups.has(context.player, entry.key, entry.minimumGrade || 0)));
            const allowed = requirements.groupMode === "any" ? results.some(Boolean) : results.every(Boolean);
            if (!allowed) return { ok: false, reason: "You do not have the required group access." };
        }
        for (const item of requirements.items || []) {
            if (!await inventory.inventory.has(context.player, item.name, item.amount || 1, { metadata: item.metadata })) {
                return { ok: false, reason: `You need ${item.amount || 1} ${item.name}.` };
            }
        }
        if (requirements.allow) {
            const result = await requirements.allow(context);
            if (result !== true) return { ok: false, reason: typeof result === "string" ? clean(result, 160) || "That shop action is unavailable." : "That shop action is unavailable." };
        }
        return { ok: true, reason: "" };
    }

    function accessContext(player: Player, shop: HmpShopDefinition<Player>, offer: HmpShopOffer<Player> | null, direction: "buy" | "sell" | null): HmpShopAccessContext<Player> {
        return { player, character: core.characters.active(player), shop, offer, direction };
    }

    function interactRequirements(shop: HmpShopDefinition<Player>): HmpInteractionRequirements<Player> | undefined {
        const requirements = shop.requirements;
        if (!requirements) return undefined;
        return {
            character: true,
            groups: requirements.groups,
            groupMode: requirements.groupMode,
            items: requirements.items,
            allow: requirements.allow ? ({ player }) => requirements.allow!(accessContext(player, shop, null, null)) : undefined,
        };
    }

    async function initializeShop(definition: HmpShopDefinition<Player>): Promise<void> {
        for (const offer of definition.offers) {
            if (offer.stock !== null && offer.stock !== undefined) await repository.ensureStock(definition.id, offer.id, offer.stock);
        }
    }

    function start(): Promise<void> {
        if (state === "stopped") return Promise.reject(new Error("hmp-shops is stopped"));
        if (startPromise) return startPromise;
        state = "starting";
        startPromise = repository.migrate(migrations)
            .then(async () => {
                await Promise.all([...shops.values()].map((record) => initializeShop(record.definition)));
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

    function registerShop(raw: HmpShopDefinition<Player>): () => boolean {
        if (state === "stopped") throw new Error("hmp-shops is stopped");
        const definition = normalizeShop(raw);
        const existing = shops.get(definition.id);
        if (existing && existing.definition.resource !== definition.resource) throw new Error(`shop '${definition.id}' is already owned by '${existing.definition.resource}'`);
        for (const offer of definition.offers) {
            if (!inventory.items.get(offer.item)) throw new Error(`shop '${definition.id}' references unknown item '${offer.item}'`);
        }
        let disposeInteraction: (() => boolean) | null = null;
        if (definition.interaction) {
            const placement = definition.interaction;
            disposeInteraction = interact.register({
                id: `shop:${definition.id}`,
                resource: definition.resource,
                label: definition.label,
                description: definition.description,
                position: placement.position,
                areaId: placement.areaId,
                regionId: placement.regionId,
                radius: placement.radius,
                promptDistance: placement.promptDistance,
                promptOffsetZ: placement.promptOffsetZ,
                priority: placement.priority,
                virtualWorld: placement.virtualWorld,
                object: placement.object,
                character: placement.character,
                requirements: interactRequirements(definition),
                handler: ({ player }) => open(player, definition.id),
            });
        }
        if (existing?.disposeInteraction) existing.disposeInteraction();
        const ready = start().then(() => initializeShop(definition));
        const record = { definition, disposeInteraction, ready };
        shops.set(definition.id, record);
        ready.catch((error) => logger.error(`[hmp-shops] could not initialize '${definition.id}'`, error));
        let registered = true;
        return () => {
            if (!registered || shops.get(definition.id) !== record) return false;
            registered = false;
            return unregisterShop(definition.id, definition.resource);
        };
    }

    function unregisterShop(rawId: string, resource?: string): boolean {
        const shopId = String(rawId || "").trim();
        const record = shops.get(shopId);
        if (!record || (resource && record.definition.resource !== resource)) return false;
        shops.delete(shopId);
        record.disposeInteraction?.();
        return true;
    }

    function registerCurrency(raw: HmpShopCurrencyProvider<Player>): () => boolean {
        const provider = normalizeCurrency(raw);
        const existing = currencies.get(provider.id);
        if (existing && existing.resource !== provider.resource) throw new Error(`currency '${provider.id}' is already owned by '${existing.resource}'`);
        currencies.set(provider.id, provider);
        let registered = true;
        return () => {
            if (!registered || currencies.get(provider.id) !== provider) return false;
            registered = false;
            return unregisterCurrency(provider.id, provider.resource);
        };
    }

    function unregisterCurrency(rawId: string, resource?: string): boolean {
        const currencyId = String(rawId || "").trim();
        const provider = currencies.get(currencyId);
        if (!provider || (resource && provider.resource !== resource)) return false;
        return currencies.delete(currencyId);
    }

    function providerFor(shop: HmpShopDefinition<Player>): HmpShopCurrencyProvider<Player> {
        const provider = currencies.get(shop.currency || "galleons");
        if (!provider) throw shopError("HMP_SHOP_CURRENCY", `Currency '${shop.currency}' is unavailable.`);
        return provider;
    }

    async function providerBalance(player: Player, provider: HmpShopCurrencyProvider<Player>): Promise<number> {
        const value = Number(await provider.balance(player));
        if (!Number.isFinite(value) || value < 0) throw new Error(`currency provider '${provider.id}' returned an invalid balance`);
        return Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(value));
    }

    function find(shopId: string, offerId: string): { record: ShopRecord; shop: HmpShopDefinition<Player>; offer: HmpShopOffer<Player> } {
        const record = shops.get(shopId);
        if (!record) throw shopError("HMP_SHOP_NOT_FOUND", `Shop '${shopId}' does not exist.`);
        const offer = record.definition.offers.find((candidate) => candidate.id === offerId);
        if (!offer) throw shopError("HMP_SHOP_OFFER", `Offer '${offerId}' does not exist.`);
        return { record, shop: record.definition, offer };
    }

    function transactionReference(options: HmpShopTransactionOptions | undefined, player: Player, shopId: string, offerId: string, direction: "buy" | "sell"): string {
        if (options?.reference) return referenceValue(options.reference);
        return `shop:${player.id}:${now().toString(36)}:${(++sequence).toString(36)}:${shopId.slice(0, 20)}:${offerId.slice(0, 20)}:${direction}`;
    }

    async function begin(player: Player, shop: HmpShopDefinition<Player>, offer: HmpShopOffer<Player>, direction: "buy" | "sell", quantity: number, options?: HmpShopTransactionOptions) {
        const character = characterOf(player);
        const unitPrice = direction === "buy" ? offer.buyPrice : offer.sellPrice;
        if (unitPrice === undefined) throw shopError("HMP_SHOP_DIRECTION", `This offer cannot be ${direction === "buy" ? "bought" : "sold"}.`);
        const amount = integer(quantity, 1, 1, offer.maxQuantity || 99);
        if (amount !== Number(quantity ?? 1)) throw shopError("HMP_SHOP_QUANTITY", "The requested shop quantity is invalid.");
        const reference = transactionReference(options, player, shop.id, offer.id, direction);
        const result = await repository.begin({
            reference,
            characterId: character.id,
            shopId: shop.id,
            offerId: offer.id,
            item: offer.item,
            direction,
            quantity: amount,
            unitPrice,
            totalPrice: unitPrice * amount,
            currency: shop.currency || "galleons",
        });
        if (!result.created) {
            if (result.transaction.status === "completed") return { existing: result.transaction, character, reference, amount, unitPrice };
            throw shopError("HMP_SHOP_REFERENCE", `Transaction reference '${reference}' has already been used.`);
        }
        return { existing: null, character, reference, amount, unitPrice };
    }

    async function validateAccess(player: Player, shop: HmpShopDefinition<Player>, offer: HmpShopOffer<Player>, direction: "buy" | "sell"): Promise<void> {
        const shopGate = await gate(shop.requirements, accessContext(player, shop, null, direction));
        if (!shopGate.ok) throw shopError("HMP_SHOP_ACCESS", shopGate.reason);
        const offerGate = await gate(offer.requirements, accessContext(player, shop, offer, direction));
        if (!offerGate.ok) throw shopError("HMP_SHOP_ACCESS", offerGate.reason);
    }

    async function buy(player: Player, shopId: string, offerId: string, quantity = 1, options?: HmpShopTransactionOptions): Promise<HmpShopTransaction> {
        const owner = playerId(player);
        if (activeTransactions.has(owner)) throw shopError("HMP_SHOP_BUSY", "A shop transaction is already in progress.");
        activeTransactions.add(owner);
        let reference = "";
        let stockReserved = false;
        let charged = false;
        let granted = false;
        let transactionState: { shop: HmpShopDefinition<Player>; offer: HmpShopOffer<Player>; provider: HmpShopCurrencyProvider<Player>; characterId: number; amount: number; total: number } | null = null;
        try {
            const { record, shop, offer } = find(shopId, offerId);
            await record.ready;
            await validateAccess(player, shop, offer, "buy");
            const started = await begin(player, shop, offer, "buy", quantity, options);
            if (started.existing) return started.existing;
            reference = started.reference;
            const provider = providerFor(shop);
            transactionState = { shop, offer, provider, characterId: started.character.id, amount: started.amount, total: started.unitPrice * started.amount };
            const currencyContext: HmpShopCurrencyContext<Player> = { player, characterId: started.character.id, shop, offer, direction: "buy", reference };
            if (offer.stock !== null && offer.stock !== undefined) {
                stockReserved = await repository.reserveStock(shop.id, offer.id, started.amount);
                if (!stockReserved) throw shopError("HMP_SHOP_OUT_OF_STOCK", "That item is out of stock.");
            }
            const total = transactionState.total;
            if (total > 0) {
                charged = await provider.debit(player, total, currencyContext);
                if (!charged) throw shopError("HMP_SHOP_FUNDS", `You do not have enough ${provider.label}.`);
            }
            const moved = await inventory.inventory.add(player, offer.item, started.amount, offer.itemOptions);
            if (moved !== started.amount) throw new Error("inventory accepted only part of the purchase");
            granted = true;
            const completed = await repository.finish(reference, "completed");
            try { events.emit("hmp:shop:purchased", { player, character: started.character, shop, offer, transaction: completed }); }
            catch (error) { logger.warn("A purchase listener failed", error); }
            return completed;
        } catch (error) {
            if (reference) {
                let compensated = true;
                try {
                    if (!transactionState) throw new Error("purchase compensation state is unavailable");
                    const { shop, offer, provider, characterId, amount, total } = transactionState;
                    const context: HmpShopCurrencyContext<Player> = { player, characterId, shop, offer, direction: "buy", reference };
                    if (granted) await inventory.inventory.remove(player, offer.item, amount, offer.itemOptions);
                    if (charged && !await provider.credit(player, total, context)) compensated = false;
                    if (stockReserved) await repository.adjustStock(shop.id, offer.id, amount);
                } catch (compensationError) {
                    compensated = false;
                    logger.error(`[hmp-shops] purchase '${reference}' compensation failed`, compensationError);
                }
                try { await repository.finish(reference, compensated && (charged || granted) ? "compensated" : "failed", messageOf(error)); }
                catch (ledgerError) { logger.error(`[hmp-shops] purchase '${reference}' ledger update failed`, ledgerError); }
            }
            throw error;
        } finally {
            activeTransactions.delete(owner);
        }
    }

    async function sell(player: Player, shopId: string, offerId: string, quantity = 1, options?: HmpShopTransactionOptions): Promise<HmpShopTransaction> {
        const owner = playerId(player);
        if (activeTransactions.has(owner)) throw shopError("HMP_SHOP_BUSY", "A shop transaction is already in progress.");
        activeTransactions.add(owner);
        let reference = "";
        let stockRaised = false;
        let removed = false;
        let paid = false;
        let transactionState: { shop: HmpShopDefinition<Player>; offer: HmpShopOffer<Player>; provider: HmpShopCurrencyProvider<Player>; characterId: number; amount: number; total: number } | null = null;
        try {
            const { record, shop, offer } = find(shopId, offerId);
            await record.ready;
            await validateAccess(player, shop, offer, "sell");
            const started = await begin(player, shop, offer, "sell", quantity, options);
            if (started.existing) return started.existing;
            reference = started.reference;
            const provider = providerFor(shop);
            transactionState = { shop, offer, provider, characterId: started.character.id, amount: started.amount, total: started.unitPrice * started.amount };
            const currencyContext: HmpShopCurrencyContext<Player> = { player, characterId: started.character.id, shop, offer, direction: "sell", reference };
            if (!await inventory.inventory.has(player, offer.item, started.amount, offer.itemOptions)) throw shopError("HMP_SHOP_ITEMS", "You do not have enough of that item.");
            if (offer.stock !== null && offer.stock !== undefined) {
                await repository.adjustStock(shop.id, offer.id, started.amount);
                stockRaised = true;
            }
            const moved = await inventory.inventory.remove(player, offer.item, started.amount, offer.itemOptions);
            if (moved !== started.amount) throw new Error("inventory removed only part of the sale");
            removed = true;
            const total = transactionState.total;
            if (total > 0) {
                paid = await provider.credit(player, total, currencyContext);
                if (!paid) throw new Error(`currency provider '${provider.id}' refused the sale payment`);
            }
            const completed = await repository.finish(reference, "completed");
            try { events.emit("hmp:shop:sold", { player, character: started.character, shop, offer, transaction: completed }); }
            catch (error) { logger.warn("A sale listener failed", error); }
            return completed;
        } catch (error) {
            if (reference) {
                let compensated = true;
                try {
                    if (!transactionState) throw new Error("sale compensation state is unavailable");
                    const { shop, offer, provider, characterId, amount, total } = transactionState;
                    const context: HmpShopCurrencyContext<Player> = { player, characterId, shop, offer, direction: "sell", reference };
                    if (paid && !await provider.debit(player, total, context)) compensated = false;
                    if (removed) await inventory.inventory.add(player, offer.item, amount, offer.itemOptions);
                    if (stockRaised) await repository.adjustStock(shop.id, offer.id, -amount);
                } catch (compensationError) {
                    compensated = false;
                    logger.error(`[hmp-shops] sale '${reference}' compensation failed`, compensationError);
                }
                try { await repository.finish(reference, compensated && (paid || removed) ? "compensated" : "failed", messageOf(error)); }
                catch (ledgerError) { logger.error(`[hmp-shops] sale '${reference}' ledger update failed`, ledgerError); }
            }
            throw error;
        } finally {
            activeTransactions.delete(owner);
        }
    }

    function money(amount: number, provider: HmpShopCurrencyProvider<Player>): string {
        return provider.symbol ? `${provider.symbol}${amount}` : `${amount} ${provider.label}`;
    }

    async function quantityPrompt(player: Player, maximum: number): Promise<number | null> {
        if (maximum <= 1) return maximum;
        const response = await ui.input(player, {
            title: "Choose quantity",
            fields: [{ name: "quantity", label: "Quantity", type: "number", required: true, default: 1, min: 1, max: maximum }],
            submitLabel: "Continue",
            allowCancel: true,
        });
        if (!response) return null;
        return integer(response.quantity, 1, 1, maximum);
    }

    async function open(player: Player, rawShopId: string): Promise<HmpShopTransaction | null> {
        const owner = playerId(player);
        const shopId = String(rawShopId || "").trim();
        const record = shops.get(shopId);
        if (!record || openPlayers.has(owner)) return null;
        openPlayers.add(owner);
        try {
            characterOf(player);
            await record.ready;
            const shop = record.definition;
            const shopGate = await gate(shop.requirements, accessContext(player, shop, null, null));
            if (!shopGate.ok) { ui.notify(player, { description: shopGate.reason, tone: "warning" }); return null; }
            const provider = providerFor(shop);
            const balance = await providerBalance(player, provider);
            const stocks = await Promise.all(shop.offers.map((offer) => offer.stock === null || offer.stock === undefined ? null : repository.getStock(shop.id, offer.id)));
            const selectedId = await ui.context(player, {
                title: shop.label,
                description: `${shop.description || "Choose an item."} Balance: ${money(balance, provider)}.`,
                options: shop.offers.map((offer, index) => {
                    const item = inventory.items.get(offer.item);
                    const prices = [offer.buyPrice === undefined ? "" : `Buy ${money(offer.buyPrice, provider)}`, offer.sellPrice === undefined ? "" : `Sell ${money(offer.sellPrice, provider)}`].filter(Boolean).join(" · ");
                    const stock = stocks[index];
                    return {
                        id: offer.id,
                        title: offer.label || item?.label || offer.item,
                        icon: offer.icon || item?.icon || undefined,
                        description: offer.description || item?.description || prices,
                        disabled: offer.buyPrice !== undefined && offer.sellPrice === undefined && stock === 0,
                        metadata: [
                            { label: "Price", value: prices },
                            ...(stock === null ? [] : [{ label: "Stock", value: String(stock) }]),
                        ],
                    };
                }),
                canClose: true,
            });
            if (!selectedId) return null;
            const offer = shop.offers.find((candidate) => candidate.id === selectedId);
            if (!offer) return null;
            const owned = await inventory.inventory.count(player, offer.item, offer.itemOptions);
            const currentStock = offer.stock === null || offer.stock === undefined ? null : await repository.getStock(shop.id, offer.id);
            const directions = await Promise.all((["buy", "sell"] as const).map(async (direction) => {
                const price = direction === "buy" ? offer.buyPrice : offer.sellPrice;
                if (price === undefined) return null;
                const result = await gate(offer.requirements, accessContext(player, shop, offer, direction));
                const unavailable = direction === "buy" ? currentStock === 0 || (price > 0 && balance < price) : owned < 1;
                return { id: direction, title: direction === "buy" ? "Buy" : "Sell", description: result.ok ? `${money(price, provider)} each` : result.reason, disabled: !result.ok || unavailable };
            }));
            const direction = await ui.context(player, {
                title: offer.label || inventory.items.get(offer.item)?.label || offer.item,
                options: directions.filter((value): value is NonNullable<typeof value> => value !== null),
                canClose: true,
            }) as "buy" | "sell" | null;
            if (!direction) return null;
            const price = direction === "buy" ? offer.buyPrice! : offer.sellPrice!;
            let maximum = offer.maxQuantity || 99;
            if (direction === "buy") {
                if (currentStock !== null) maximum = Math.min(maximum, currentStock || 0);
                if (price > 0) maximum = Math.min(maximum, Math.floor(balance / price));
            } else maximum = Math.min(maximum, owned);
            if (maximum < 1) { ui.notify(player, { description: direction === "buy" ? "You cannot afford that item or it is out of stock." : "You do not have that item.", tone: "warning" }); return null; }
            const quantity = await quantityPrompt(player, maximum);
            if (!quantity) return null;
            const confirmation = await ui.alert(player, {
                title: `${direction === "buy" ? "Buy" : "Sell"} ${quantity} × ${offer.label || inventory.items.get(offer.item)?.label || offer.item}?`,
                content: `Total: ${money(price * quantity, provider)}`,
                confirmLabel: direction === "buy" ? "Buy" : "Sell",
                cancelLabel: "Cancel",
                cancel: true,
            });
            if (confirmation !== "confirm") return null;
            try {
                const transaction = direction === "buy" ? await buy(player, shop.id, offer.id, quantity) : await sell(player, shop.id, offer.id, quantity);
                ui.notify(player, { description: `${direction === "buy" ? "Purchased" : "Sold"} ${quantity} × ${offer.label || inventory.items.get(offer.item)?.label || offer.item}.`, tone: "success" });
                return transaction;
            } catch (error) {
                ui.notify(player, { description: messageOf(error), tone: "error" });
                return null;
            }
        } catch (error) {
            logger.warn(`[hmp-shops] could not open '${shopId}' for #${owner}: ${messageOf(error)}`);
            ui.notify(player, { description: messageOf(error), tone: "error" });
            return null;
        } finally {
            openPlayers.delete(owner);
        }
    }

    function characterId(target: Player | number): number {
        if (typeof target === "number") {
            if (!Number.isSafeInteger(target) || target <= 0) throw new TypeError("character id is invalid");
            return target;
        }
        playerId(target);
        return characterOf(target).id;
    }

    function removeForResource(resource: string): number {
        let removed = 0;
        for (const record of [...shops.values()]) if (record.definition.resource === resource && unregisterShop(record.definition.id, resource)) removed++;
        for (const provider of [...currencies.values()]) if (provider.resource === resource && unregisterCurrency(provider.id, resource)) removed++;
        return removed;
    }

    function disconnect(player: Player): boolean {
        const owner = playerId(player);
        openPlayers.delete(owner);
        activeTransactions.delete(owner);
        return true;
    }

    async function stop(): Promise<void> {
        if (state === "stopped") return;
        state = "stopped";
        for (const record of shops.values()) record.disposeInteraction?.();
        shops.clear();
        currencies.clear();
        openPlayers.clear();
        activeTransactions.clear();
    }

    registerCurrency({
        id: "galleons",
        resource: "hmp-shops",
        label: "Galleons",
        symbol: "Ⓖ",
        balance: (player) => inventory.inventory.count(player, "native:galleons"),
        async debit(player, amount) {
            if (!await inventory.inventory.has(player, "native:galleons", amount)) return false;
            return (await inventory.inventory.remove(player, "native:galleons", amount)) === amount;
        },
        async credit(player, amount) {
            return (await inventory.inventory.add(player, "native:galleons", amount)) === amount;
        },
    });

    return Object.freeze({
        shops: Object.freeze({ register: registerShop, unregister: unregisterShop, get: (shopId: string) => shops.get(String(shopId || "").trim())?.definition || null, list: (resource?: string) => [...shops.values()].map((record) => record.definition).filter((shop) => !resource || shop.resource === resource), open }),
        currencies: Object.freeze({ register: registerCurrency, unregister: unregisterCurrency, get: (currencyId: string) => currencies.get(String(currencyId || "").trim()) || null, list: (resource?: string) => [...currencies.values()].filter((provider) => !resource || provider.resource === resource), balance: async (player: Player, currency = "galleons") => {
            playerId(player);
            const provider = currencies.get(normalizeId(currency, "currency id"));
            if (!provider) throw shopError("HMP_SHOP_CURRENCY", `Currency '${currency}' is unavailable.`);
            return providerBalance(player, provider);
        } }),
        transactions: Object.freeze({ buy, sell, history: (target: Player | number, limit = 50) => repository.history(characterId(target), integer(limit, 50, 1, 200)) }),
        stock: Object.freeze({
            get: (shopId: string, offerId: string) => repository.getStock(normalizeId(shopId, "shop id"), normalizeId(offerId, "offer id")),
            set: (shopId: string, offerId: string, quantity: number) => repository.setStock(normalizeId(shopId, "shop id"), normalizeId(offerId, "offer id"), integer(quantity, 0, 0, 2147483647)),
            adjust: (shopId: string, offerId: string, delta: number) => repository.adjustStock(normalizeId(shopId, "shop id"), normalizeId(offerId, "offer id"), integer(delta, 0, -2147483647, 2147483647)),
        }),
        status: () => ({ state, lastError, shops: shops.size, currencies: currencies.size, activeTransactions: activeTransactions.size, uptimeMs: now() - startedAt }),
        start,
        removeForResource,
        disconnect,
        stop,
    });
}

export = { createShopsService, shopError, referenceValue };
