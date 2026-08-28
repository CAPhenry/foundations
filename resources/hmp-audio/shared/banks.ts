import normalizeModule = require("./normalize");
import type { HmpAudioBankLease, HmpAudioBanksApi, HmpAudioOwner } from "../types";

const { bank: normalizeBank, owner: normalizeOwner } = normalizeModule;

interface BankDependencies {
    load(bank: string): unknown;
    unload(bank: string): unknown;
}

interface BankRecord {
    bank: string;
    owners: Map<string, Required<HmpAudioOwner>>;
}

function createBankRegistry(dependencies: BankDependencies) {
    const records = new Map<string, BankRecord>();

    function acquire(rawOwner: HmpAudioOwner, rawBank: string): boolean {
        const owner = normalizeOwner(rawOwner);
        const bank = normalizeBank(rawBank);
        const key = bank.toLowerCase();
        const existing = records.get(key);
        if (existing?.owners.has(owner.key)) return false;
        if (!existing && dependencies.load(bank) === false) return false;
        const record = existing || { bank, owners: new Map<string, Required<HmpAudioOwner>>() };
        record.owners.set(owner.key, { resource: owner.resource, id: owner.id });
        records.set(key, record);
        return true;
    }

    function release(rawOwner: HmpAudioOwner, rawBank: string): boolean {
        const owner = normalizeOwner(rawOwner);
        const key = normalizeBank(rawBank).toLowerCase();
        const record = records.get(key);
        if (!record?.owners.delete(owner.key)) return false;
        if (!record.owners.size) {
            records.delete(key);
            dependencies.unload(record.bank);
        }
        return true;
    }

    function releaseOwner(rawOwner: HmpAudioOwner): number {
        const owner = normalizeOwner(rawOwner);
        let released = 0;
        for (const record of [...records.values()]) if (record.owners.has(owner.key) && release(owner, record.bank)) released++;
        return released;
    }

    function cleanup(resource: string): number {
        const normalized = normalizeOwner({ resource, id: "cleanup" }).resource;
        let released = 0;
        for (const record of [...records.values()]) {
            for (const owner of [...record.owners.values()]) {
                if (owner.resource === normalized && release(owner, record.bank)) released++;
            }
        }
        return released;
    }

    function list(rawOwner?: HmpAudioOwner): HmpAudioBankLease[] {
        const owner = rawOwner ? normalizeOwner(rawOwner) : null;
        return [...records.values()]
            .filter((record) => !owner || record.owners.has(owner.key))
            .map((record) => ({ bank: record.bank, owners: [...record.owners.values()].map((entry) => ({ ...entry })) }))
            .sort((left, right) => left.bank.localeCompare(right.bank));
    }

    function stop(): number {
        const count = records.size;
        for (const record of records.values()) dependencies.unload(record.bank);
        records.clear();
        return count;
    }

    const api: HmpAudioBanksApi = Object.freeze({ acquire, release, releaseOwner, list });
    return { api, cleanup, stop, count: () => records.size };
}

export = { createBankRegistry };
