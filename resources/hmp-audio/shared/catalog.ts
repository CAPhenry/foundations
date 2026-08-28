import normalizeModule = require("./normalize");
import type { HmpAudioCatalogApi, HmpAudioCatalogEntry, HmpAudioOwner } from "../types";

const { aliases: normalizeAliases, event: normalizeEvent, owner: normalizeOwner } = normalizeModule;

interface CatalogDependencies {
    bankFor(event: string): string;
    stopEventFor(event: string): string;
    onChange?(): void;
}

interface CatalogRegistration {
    owner: Required<HmpAudioOwner> & { key: string };
    aliases: Record<string, string>;
    token: number;
}

function createCatalog(
    initial: Readonly<Record<string, string>>,
    dependencies: CatalogDependencies,
    initialOwner: HmpAudioOwner = { resource: "hmp-audio", id: "config" },
) {
    const registrations = new Map<string, CatalogRegistration>();
    let token = 0;

    function effective(excludingOwner?: string): Map<string, HmpAudioCatalogEntry> {
        const entries = new Map<string, HmpAudioCatalogEntry>();
        for (const registration of registrations.values()) {
            if (registration.owner.key === excludingOwner) continue;
            for (const [alias, event] of Object.entries(registration.aliases)) {
                entries.set(alias, { alias, event, owner: { resource: registration.owner.resource, id: registration.owner.id } });
            }
        }
        return entries;
    }

    function replace(rawOwner: HmpAudioOwner, rawAliases: Readonly<Record<string, string>>, notify = true): number {
        const owner = normalizeOwner(rawOwner);
        const aliases = normalizeAliases(rawAliases);
        const existing = effective(owner.key);
        for (const alias of Object.keys(aliases)) {
            const collision = existing.get(alias);
            if (collision) throw new Error(`audio alias '${alias}' is already owned by '${collision.owner.resource}:${collision.owner.id}'`);
        }
        const nextToken = ++token;
        registrations.set(owner.key, { owner, aliases, token: nextToken });
        if (notify) dependencies.onChange?.();
        return nextToken;
    }

    function register(rawOwner: HmpAudioOwner, rawAliases: Readonly<Record<string, string>>): () => boolean {
        const owner = normalizeOwner(rawOwner);
        const registrationToken = replace(owner, rawAliases);
        let active = true;
        return () => {
            if (!active || registrations.get(owner.key)?.token !== registrationToken) return false;
            active = false;
            registrations.delete(owner.key);
            dependencies.onChange?.();
            return true;
        };
    }

    function unregister(rawOwner: HmpAudioOwner): boolean {
        const owner = normalizeOwner(rawOwner);
        if (!registrations.delete(owner.key)) return false;
        dependencies.onChange?.();
        return true;
    }

    function cleanup(resource: string): number {
        const normalized = normalizeOwner({ resource, id: "cleanup" }).resource;
        let removed = 0;
        for (const [key, registration] of [...registrations]) {
            if (registration.owner.resource !== normalized) continue;
            registrations.delete(key);
            removed++;
        }
        if (removed) dependencies.onChange?.();
        return removed;
    }

    function resolve(aliasOrEvent: string): string {
        const input = normalizeEvent(aliasOrEvent);
        return effective().get(input.toLowerCase())?.event || input;
    }

    function list(search = ""): HmpAudioCatalogEntry[] {
        const query = String(search || "").trim().toLowerCase();
        return [...effective().values()]
            .filter((entry) => !query || entry.alias.includes(query) || entry.event.toLowerCase().includes(query))
            .sort((left, right) => left.alias.localeCompare(right.alias));
    }

    const api: HmpAudioCatalogApi = Object.freeze({
        resolve,
        list,
        register,
        unregister,
        bankFor: (value: string) => String(dependencies.bankFor(resolve(value)) || ""),
        stopEventFor: (value: string) => String(dependencies.stopEventFor(resolve(value)) || ""),
    });

    replace(initialOwner, initial, false);
    return { api, replace, cleanup, count: () => effective().size };
}

export = { createCatalog };
