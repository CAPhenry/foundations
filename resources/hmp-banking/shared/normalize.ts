import type {
    HmpBankCurrency,
    HmpBankOrganizationDefinition,
    HmpBankOrganizationRule,
    HmpBankPermission,
} from "../types";

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/;
const PERMISSIONS = new Set<HmpBankPermission>(["view", "deposit", "withdraw", "transfer", "manage"]);
const MAX_AMOUNT = Number.MAX_SAFE_INTEGER;

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

function reference(value: unknown): string {
    const normalized = String(value ?? "").trim();
    if (!REFERENCE.test(normalized)) throw new TypeError("bank transaction reference is invalid");
    return normalized;
}

function integer(value: unknown, fallback: number, minimum: number, maximum: number): number {
    const numeric = Number(value);
    return Math.trunc(Math.min(maximum, Math.max(minimum, Number.isFinite(numeric) ? numeric : fallback)));
}

function amount(value: unknown): number {
    const normalized = integer(value, 0, 1, MAX_AMOUNT);
    if (normalized !== Number(value)) throw new TypeError("bank amount must be a positive safe integer");
    return normalized;
}

function metadata(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const result = { ...(value as Record<string, unknown>) };
    const encoded = JSON.stringify(result);
    if (encoded.length > 8192) throw new TypeError("bank transaction metadata is too large");
    return result;
}

function normalizeCurrency(raw: HmpBankCurrency): HmpBankCurrency {
    if (!raw || typeof raw !== "object") throw new TypeError("bank currency is required");
    return Object.freeze({
        id: id(raw.id, "bank currency id"),
        resource: id(raw.resource, "bank currency resource"),
        label: clean(raw.label, 48) || id(raw.id, "bank currency id"),
        symbol: clean(raw.symbol, 8) || undefined,
        cashItem: raw.cashItem ? id(raw.cashItem, "bank cash item") : undefined,
    });
}

function normalizeRule(raw: HmpBankOrganizationRule): HmpBankOrganizationRule {
    if (!raw || typeof raw !== "object") throw new TypeError("organization access rule is required");
    const permissions = [...new Set((raw.permissions || []).filter((entry): entry is HmpBankPermission => PERMISSIONS.has(entry)))];
    if (!permissions.length) throw new TypeError("organization access rule needs a permission");
    return Object.freeze({
        group: id(raw.group, "organization group"),
        minimumGrade: integer(raw.minimumGrade, 0, -100000, 100000),
        permissions: Object.freeze(permissions),
    });
}

function normalizeOrganization<P>(raw: HmpBankOrganizationDefinition<P>): HmpBankOrganizationDefinition<P> {
    if (!raw || typeof raw !== "object") throw new TypeError("bank organization is required");
    const organizationId = id(raw.id, "bank organization id");
    return Object.freeze({
        id: organizationId,
        resource: id(raw.resource, "bank organization resource"),
        label: clean(raw.label, 80) || organizationId,
        currency: id(raw.currency || "galleons", "bank organization currency"),
        rules: Object.freeze((raw.rules || []).slice(0, 32).map(normalizeRule)),
        allow: typeof raw.allow === "function" ? raw.allow : undefined,
    });
}

function accountNumber(idValue: number): string {
    if (!Number.isSafeInteger(idValue) || idValue <= 0) throw new TypeError("bank account id is invalid");
    return `HMP-${idValue.toString(36).toUpperCase().padStart(8, "0")}`;
}

function accountId(value: unknown): number {
    if (typeof value === "number") {
        if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError("bank account id is invalid");
        return value;
    }
    const normalized = String(value ?? "").trim().toUpperCase();
    const match = /^HMP-([0-9A-Z]{1,13})$/.exec(normalized);
    if (!match) throw new TypeError("bank account number is invalid");
    const parsed = Number.parseInt(match[1], 36);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new TypeError("bank account number is invalid");
    return parsed;
}

export = {
    MAX_AMOUNT,
    clean,
    id,
    reference,
    integer,
    amount,
    metadata,
    normalizeCurrency,
    normalizeOrganization,
    accountNumber,
    accountId,
};
