import assert = require("node:assert");
import activityModule = require("../../hmp-activities/server/service");
import pvpModule = require("../../hmp-pvp/server/service");
import duelModule = require("../server/service");
import type { HmpDuelPlayer } from "../types";

const { createActivityService } = activityModule;
const { createPvpService } = pvpModule;
const { createDuelService } = duelModule;
interface Player extends HmpDuelPlayer { area: string }
const makePlayer = (id: number, area = "Hogwarts"): Player => ({ id, nickname: `Player ${id}`, virtualWorld: 0, area, emit() {}, location() { return { areaId: this.area, regionId: "GreatHall" }; } });

async function run(): Promise<void> {
    const players = [makePlayer(1), makePlayer(2), makePlayer(3), makePlayer(4, "Overland")];
    const core = { characters: { active: (player: Player | number) => { const id = typeof player === "number" ? player : player.id; return { id: id * 10, accountId: id, slot: 1, name: `Character ${id}`, status: "active", createdAt: "", updatedAt: "", deletedAt: null }; } } };
    let sequence = 0;
    const activities = createActivityService<Player>({ core: core as never, config: { command: "activities", enableCommands: false, maxDefinitions: 10, maxSessions: 10, maxMetadataBytes: 1024, maxInvitations: 20, defaultInvitationTtlSeconds: 30, maximumInvitationTtlSeconds: 60, defaultLobbyTtlSeconds: 300, maximumLobbyTtlSeconds: 600, sweepIntervalSeconds: 30, enableTestActivity: false }, id: () => `id-${++sequence}` });
    let nativePolicy: ((hit: any) => any) | null = null;
    const pvp = createPvpService({ defaultDecision: "deny", initialLethalMode: false, install: (fn) => { nativePolicy = fn; }, clearPolicy: () => { nativePolicy = null; }, vitals: () => null, applyMode: () => undefined });
    const timers: Array<() => void> = [];
    const emitted: Array<{ player: number; event: string; payload: Record<string, unknown> }> = [];
    const duels = createDuelService<Player>({ activities, pvp, player: (id) => players.find((entry) => entry.id === id) || null, emit: (player, event, payload) => emitted.push({ player: player.id, event, payload }), notify() {}, countdownSeconds: 3, invitationTtlSeconds: 30, koHp: 1, setTimer: ((handler: () => void) => { timers.push(handler); return { unref() {} } as NodeJS.Timeout; }), clearTimer() {} });

    const challenge = await duels.challenge(players[0], players[1]);
    assert.strictEqual(activities.invitations.list().length, 1);
    await assert.rejects(duels.challenge(players[0], players[2]), /exclusive activity/);
    await assert.rejects(duels.challenge(players[2], players[3]), /game area/);
    assert.strictEqual(await duels.accept(players[1]), true);
    assert.strictEqual(activities.sessions.get(challenge.sessionId)?.state, "running");
    const hit = { casterId: 1, victimId: 2, spellId: 1, spell: "BasicCast", damage: 10, duration: 0, victimHp: 20 };
    assert.strictEqual(nativePolicy!(hit), false);
    timers.shift()!();
    assert.deepStrictEqual(nativePolicy!(hit), { minHp: 1 });
    assert.deepStrictEqual(nativePolicy!({ ...hit, damage: 25 }), { damage: 19, minHp: 1 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.strictEqual(activities.sessions.get(challenge.sessionId), null);
    assert.ok(emitted.some((entry) => entry.event === "hmp-duels:end" && entry.payload.result === "win"));
    assert.ok(emitted.some((entry) => entry.event === "hmp-duels:end" && entry.payload.result === "lose"));

    await duels.challenge(players[0], players[1]);
    assert.strictEqual(await duels.decline(players[1]), true);
    assert.strictEqual(activities.sessions.forPlayer(players[0]).length, 0);
    await duels.stop(); await activities.stop(); pvp.stop();
    assert.strictEqual(duels.status().state, "stopped");
}
run().then(() => console.log("hmp-duels tests passed"));
