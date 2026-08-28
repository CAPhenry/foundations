import type {
    HmpShopCurrencyProvider,
    HmpShopDefinition,
    HmpShopOffer,
    HmpShopRequirements,
} from "../types";

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;

function clean(value: unknown, maximum = 120): string {
    return Array.from(String(value ?? ""), (character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127 ? " " : character;
    }).join("").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function id(value: unknown, name: string): string {
    const normalized = String(value ?? "").trim();
    if (!ID.test(normalized)) throw new TypeError(`${name} is invalid`);
    return normalized;
}

function integer(value: unknown, fallback: number, minimum: number, maximum: number): number {
    const number = Number(value);
    return Math.trunc(Math.min(maximum, Math.max(minimum, Number.isFinite(number) ? number : fallback)));
}

function requirements<P>(raw?: HmpShopRequirements<P>): HmpShopRequirements<P> | undefined {
    if (!raw) return undefined;
    const groups = (raw.groups || []).slice(0, 16).map((entry) => Object.freeze({
        key: id(entry.key, "shop group key"),
        minimumGrade: integer(entry.minimumGrade, 0, -100000, 100000),
    }));
    const items = (raw.items || []).slice(0, 16).map((entry) => Object.freeze({
        name: id(entry.name, "shop requirement item"),
        amount: integer(entry.amount, 1, 1, 1000000),
        metadata: entry.metadata && typeof entry.metadata === "object" && !Array.isArray(entry.metadata) ? { ...entry.metadata } : undefined,
    }));
    return Object.freeze({
        character: raw.character === true,
        groups: Object.freeze(groups),
        groupMode: raw.groupMode === "any" ? "any" : "all",
        items: Object.freeze(items),
        allow: typeof raw.allow === "function" ? raw.allow : undefined,
    });
}

function normalizeOffer<P>(raw: HmpShopOffer<P>, seen: Set<string>): HmpShopOffer<P> {
    if (!raw || typeof raw !== "object") throw new TypeError("shop offer is required");
    const offerId = id(raw.id, "shop offer id");
    if (seen.has(offerId)) throw new TypeError(`shop offer '${offerId}' is duplicated`);
    seen.add(offerId);
    const item = id(raw.item, "shop item");
    const buyPrice = raw.buyPrice === undefined ? undefined : integer(raw.buyPrice, 0, 0, 2147483647);
    const sellPrice = raw.sellPrice === undefined ? undefined : integer(raw.sellPrice, 0, 0, 2147483647);
    if (buyPrice === undefined && sellPrice === undefined) throw new TypeError(`shop offer '${offerId}' needs a buyPrice or sellPrice`);
    const options = raw.itemOptions ? Object.freeze({
        metadata: raw.itemOptions.metadata && typeof raw.itemOptions.metadata === "object" && !Array.isArray(raw.itemOptions.metadata) ? { ...raw.itemOptions.metadata } : undefined,
        variation: clean(raw.itemOptions.variation, 96) || undefined,
        identified: raw.itemOptions.identified === true,
    }) : undefined;
    return Object.freeze({
        id: offerId,
        item,
        label: clean(raw.label, 80) || undefined,
        description: clean(raw.description, 180) || undefined,
        icon: clean(raw.icon, 400) || undefined,
        buyPrice,
        sellPrice,
        stock: raw.stock === null || raw.stock === undefined ? null : integer(raw.stock, 0, 0, 2147483647),
        maxQuantity: integer(raw.maxQuantity, 99, 1, 1000000),
        itemOptions: options,
        requirements: requirements(raw.requirements),
    });
}

function normalizeShop<P>(raw: HmpShopDefinition<P>): HmpShopDefinition<P> {
    if (!raw || typeof raw !== "object") throw new TypeError("shop definition is required");
    const shopId = id(raw.id, "shop id");
    if (shopId.length > 58) throw new TypeError("shop id is too long for its interaction id");
    const resource = id(raw.resource, "shop resource");
    const seen = new Set<string>();
    const offers = (raw.offers || []).slice(0, 24).map((offer) => normalizeOffer(offer, seen));
    if (!offers.length) throw new TypeError(`shop '${shopId}' needs at least one offer`);
    const interaction = raw.interaction ? Object.freeze({
        ...raw.interaction,
        position: Object.freeze({ x: Number(raw.interaction.position?.x), y: Number(raw.interaction.position?.y), z: Number(raw.interaction.position?.z) }),
        areaId: clean(raw.interaction.areaId, 128) || undefined,
        regionId: clean(raw.interaction.regionId, 128) || undefined,
    }) : undefined;
    if (interaction && !Object.values(interaction.position).every(Number.isFinite)) throw new TypeError(`shop '${shopId}' interaction needs a finite position`);
    return Object.freeze({
        id: shopId,
        resource,
        label: clean(raw.label, 80) || shopId,
        description: clean(raw.description, 180) || undefined,
        currency: id(raw.currency || "galleons", "shop currency"),
        requirements: requirements(raw.requirements),
        interaction,
        offers: Object.freeze(offers),
    });
}

function normalizeCurrency<P>(raw: HmpShopCurrencyProvider<P>): HmpShopCurrencyProvider<P> {
    if (!raw || typeof raw !== "object") throw new TypeError("currency provider is required");
    if (typeof raw.balance !== "function" || typeof raw.debit !== "function" || typeof raw.credit !== "function") throw new TypeError("currency provider needs balance, debit and credit methods");
    return Object.freeze({
        id: id(raw.id, "currency id"),
        resource: id(raw.resource, "currency resource"),
        label: clean(raw.label, 40) || id(raw.id, "currency id"),
        symbol: clean(raw.symbol, 12) || undefined,
        balance: raw.balance,
        debit: raw.debit,
        credit: raw.credit,
    });
}

export = { clean, id, integer, requirements, normalizeOffer, normalizeShop, normalizeCurrency };
