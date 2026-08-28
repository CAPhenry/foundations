import normalizeModule = require("../shared/normalize");
import type { HmpHouseId, HmpHouseMutationOptions, HmpHousePointOptions, HmpHousePointTransaction } from "../types";
import type { HousesDependencies, HousesService, Player, PointDraft } from "./internal";

const { HOUSES, house: normalizeHouse, nativeHouse, clean, positiveId, limit, signedAmount, metadata } = normalizeModule;

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function createHousesService(dependencies: HousesDependencies): HousesService {
    const { repository, core, events, logger, config, migrations } = dependencies;
    const now = dependencies.now || Date.now;
    const startedAt = now();
    const syncedPlayers = new Set<number>();
    let state: "starting" | "ready" | "degraded" | "stopped" = "starting";
    let lastError = "";
    let pendingTransactions = 0;
    let startPromise: Promise<void> | null = null;

    function start(): Promise<void> {
        if (state === "stopped") return Promise.reject(new Error("hmp-houses is stopped"));
        if (startPromise) return startPromise;
        state = "starting";
        startPromise = repository.migrate(migrations).then(async () => {
            pendingTransactions = (await repository.pendingPoints(200)).length;
            state = "ready";
            lastError = "";
        }).catch((error) => {
            state = "degraded";
            lastError = messageOf(error).slice(0, 191);
            throw error;
        });
        return startPromise;
    }

    function playerId(player: Player): number {
        const id = Number(player?.id);
        if (!Number.isSafeInteger(id) || id < 0) throw new TypeError("a connected player is required");
        return id;
    }

    function activeCharacter(player: Player) {
        playerId(player);
        const character = core.characters.active(player);
        if (!character) throw new Error("Select a character before using houses");
        return character;
    }

    function characterId(target: Player | number): number {
        return typeof target === "number" ? positiveId(target, "character id") : activeCharacter(target).id;
    }

    function actorCharacterId(actor: Player | number | null | undefined): number | null {
        if (actor === undefined || actor === null) return null;
        return characterId(actor);
    }

    function onlinePlayer(characterId: number): Player | null {
        return core.sessions.all().find((session) => session.character?.id === characterId)?.player || null;
    }

    function optionalText(value: unknown, maximum: number): string {
        return String(value || "").trim().slice(0, maximum);
    }

    function resource(value: unknown): string {
        return clean(value, "source resource", 64);
    }

    async function project(characterId: number, house: HmpHouseId | null): Promise<void> {
        const groups = await core.groups.listCharacter(characterId);
        const ownedKeys = new Set(HOUSES.map((entry) => `${config.groupPrefix}${entry}`));
        for (const group of groups) if (ownedKeys.has(group.key.toLowerCase()) && group.key.toLowerCase() !== (house ? `${config.groupPrefix}${house}` : "")) await core.groups.removeCharacter(characterId, group.key);
        if (house) await core.groups.setCharacter(characterId, `${config.groupPrefix}${house}`, 0, { source: "hmp-houses", house });
    }

    function applyNative(player: Player, house: HmpHouseId | null): void {
        player.house = nativeHouse(house);
        syncedPlayers.add(playerId(player));
    }

    async function sync(player: Player) {
        await start();
        const character = activeCharacter(player);
        const membership = await repository.membership(character.id);
        await project(character.id, membership?.house || null);
        applyNative(player, membership?.house || null);
        return membership;
    }

    async function getMembership(target: Player | number) {
        await start();
        return repository.membership(characterId(target));
    }

    async function setMembership(target: Player | number, rawHouse: HmpHouseId, options: HmpHouseMutationOptions<Player>) {
        await start();
        if (!options) throw new TypeError("house mutation options are required");
        const targetCharacterId = characterId(target);
        const house = normalizeHouse(rawHouse);
        const result = await repository.setMembership({
            characterId: targetCharacterId,
            house,
            actorCharacterId: actorCharacterId(options.actor),
            resource: resource(options.resource),
            reason: optionalText(options.reason, 191),
        });
        await project(targetCharacterId, house);
        const player = typeof target === "number" ? onlinePlayer(targetCharacterId) : target;
        if (player) applyNative(player, house);
        if (result.previousHouse !== house) events.emit("hmp:houses:changed", { player, character: player ? core.characters.active(player) : null, membership: result.membership, previousHouse: result.previousHouse });
        return result.membership;
    }

    async function clearMembership(target: Player | number, options: HmpHouseMutationOptions<Player>): Promise<boolean> {
        await start();
        if (!options) throw new TypeError("house mutation options are required");
        const targetCharacterId = characterId(target);
        const previousHouse = await repository.clearMembership(targetCharacterId, actorCharacterId(options.actor), resource(options.resource), optionalText(options.reason, 191));
        await project(targetCharacterId, null);
        const player = typeof target === "number" ? onlinePlayer(targetCharacterId) : target;
        if (player) applyNative(player, null);
        if (previousHouse) events.emit("hmp:houses:changed", { player, character: player ? core.characters.active(player) : null, membership: null, previousHouse });
        return previousHouse !== null;
    }

    function pointReference(value: unknown): string {
        const reference = clean(value, "house point reference", 96);
        if (!/^[A-Za-z0-9_.:-]+$/.test(reference)) throw new TypeError("house point reference may contain only letters, numbers, dot, underscore, colon, and dash");
        return reference;
    }

    function pointDraft(rawHouse: HmpHouseId, rawAmount: number, options: HmpHousePointOptions<Player>): PointDraft {
        if (!options) throw new TypeError("house point options are required");
        return {
            reference: pointReference(options.reference),
            house: normalizeHouse(rawHouse),
            amount: signedAmount(rawAmount),
            actorCharacterId: actorCharacterId(options.actor),
            resource: resource(options.resource),
            reason: optionalText(options.reason, 191),
            metadata: metadata(options.metadata),
        };
    }

    function assertReplay(transaction: HmpHousePointTransaction, draft: PointDraft): void {
        if (transaction.house !== draft.house || transaction.amount !== draft.amount || transaction.actorCharacterId !== draft.actorCharacterId || transaction.resource !== draft.resource) {
            throw Object.assign(new Error(`House point reference '${draft.reference}' was reused for a different operation`), { code: "HMP_HOUSES_REFERENCE" });
        }
    }

    async function adjust(rawHouse: HmpHouseId, rawAmount: number, options: HmpHousePointOptions<Player>): Promise<HmpHousePointTransaction> {
        await start();
        const draft = pointDraft(rawHouse, rawAmount, options);
        const begun = await repository.beginPoint(draft);
        assertReplay(begun.transaction, draft);
        if (begun.transaction.status === "failed") throw new Error(`House point transaction '${draft.reference}' failed: ${begun.transaction.error}`);
        const shouldEmit = begun.transaction.status !== "completed";
        let transaction: HmpHousePointTransaction;
        try { transaction = begun.transaction.status === "completed" ? begun.transaction : await repository.applyPoint(draft.reference, config.allowNegativePoints); }
        catch (error) {
            if (begun.transaction.status === "pending") await repository.failPoint(draft.reference, messageOf(error));
            pendingTransactions = (await repository.pendingPoints(200)).length;
            throw error;
        }
        pendingTransactions = (await repository.pendingPoints(200)).length;
        if (shouldEmit) events.emit("hmp:houses:points", { transaction, standing: await repository.standing(transaction.house) });
        return transaction;
    }

    async function recover(rawReference: string): Promise<HmpHousePointTransaction> {
        await start();
        const reference = pointReference(rawReference);
        const existing = await repository.pointTransaction(reference);
        if (!existing) throw new Error(`House point transaction '${reference}' does not exist`);
        if (existing.status === "failed") throw new Error(`House point transaction '${reference}' failed: ${existing.error}`);
        const shouldEmit = existing.status !== "completed";
        const transaction = shouldEmit ? await repository.applyPoint(reference, config.allowNegativePoints) : existing;
        pendingTransactions = (await repository.pendingPoints(200)).length;
        if (shouldEmit) events.emit("hmp:houses:points", { transaction, standing: await repository.standing(transaction.house), recovered: true });
        return transaction;
    }

    async function characterLoaded(player: Player): Promise<void> {
        try { await sync(player); }
        catch (error) { logger.warn(`[hmp-houses] could not synchronize #${player.id}: ${messageOf(error)}`); }
    }

    function disconnect(player: Player): boolean {
        syncedPlayers.delete(Number(player.id));
        return true;
    }

    async function stop(): Promise<void> {
        state = "stopped";
        syncedPlayers.clear();
    }

    return Object.freeze({
        membership: Object.freeze({
            get: getMembership, set: setMembership, clear: clearMembership,
            members: async (rawHouse: HmpHouseId, rawLimit = 50) => { await start(); return repository.members(normalizeHouse(rawHouse), limit(rawLimit)); },
            history: async (rawCharacterId: number, rawLimit = 50) => { await start(); return repository.membershipHistory(positiveId(rawCharacterId, "character id"), limit(rawLimit)); },
            sync,
        }),
        points: Object.freeze({
            get: async (rawHouse: HmpHouseId) => { await start(); return repository.standing(normalizeHouse(rawHouse)); },
            standings: async () => { await start(); return repository.standings(); },
            adjust,
            award: (house: HmpHouseId, amount: number, options: HmpHousePointOptions<Player>) => {
                const value = signedAmount(amount);
                if (value < 0) throw new TypeError("award amount must be positive");
                return adjust(house, value, options);
            },
            deduct: (house: HmpHouseId, amount: number, options: HmpHousePointOptions<Player>) => {
                const value = signedAmount(amount);
                if (value < 0) throw new TypeError("deduct amount must be positive");
                return adjust(house, -value, options);
            },
            transaction: async (reference: string) => { await start(); return repository.pointTransaction(pointReference(reference)); },
            history: async (rawHouse?: HmpHouseId, rawLimit = 50) => { await start(); return repository.pointHistory(rawHouse ? normalizeHouse(rawHouse) : undefined, limit(rawLimit)); },
            pending: async (rawLimit = 50) => { await start(); const rows = await repository.pendingPoints(limit(rawLimit)); pendingTransactions = rows.length; return rows; },
            recover,
        }),
        status: () => ({ state, lastError, syncedPlayers: syncedPlayers.size, pendingTransactions, uptimeMs: Math.max(0, now() - startedAt) }),
        start, characterLoaded, disconnect, stop,
    });
}

export = { createHousesService };
