import type { HmpPvpClient } from "../../hmp-pvp/types";

const pvpFoundation = Imports.get<HmpPvpClient>("hmp-pvp");
let countdownTimer: ReturnType<typeof setInterval> | null = null;
let restoreTimer: ReturnType<typeof setTimeout> | null = null;

function reset(): void {
    if (countdownTimer) clearInterval(countdownTimer); countdownTimer = null;
    if (restoreTimer) clearTimeout(restoreTimer); restoreTimer = null;
    try {
        Pvp.endDuelContext(); Pvp.showMeter(null); pvpFoundation.mode.restore();
        LocalPlayer.stateInfo.setInvulnerableToDamage(false);
    } catch (_) { /* no pawn while loading */ }
}

function parse(raw: unknown): Record<string, unknown> {
    if (typeof raw === "string") { try { return JSON.parse(raw) as Record<string, unknown>; } catch (_) { return {}; } }
    return raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
}

reset();
Events.on("hmp-duels:countdown", (raw: unknown) => {
    const payload = parse(raw); const opponentId = Number(payload.opponentId) || 0;
    Pvp.startDuelContext(); Pvp.setTargetable(opponentId); Pvp.setTeam("Enemy", opponentId); Pvp.showMeter(opponentId);
    LocalPlayer.stateInfo.setInvulnerableToDamage(true);
    let remaining = Math.max(1, Number(payload.seconds) || 3);
    Game.notify(`Duel against ${String(payload.opponentName || "opponent")} begins in ${remaining}…`);
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(() => { remaining--; if (remaining <= 0) { clearInterval(countdownTimer!); countdownTimer = null; } else Game.notify(String(remaining)); }, 1000);
});
Events.on("hmp-duels:start", (raw: unknown) => {
    const payload = parse(raw); const opponentId = Number(payload.opponentId) || 0;
    Pvp.startDuelContext(); Pvp.setTargetable(opponentId); Pvp.setTeam("Enemy", opponentId); Pvp.showMeter(opponentId);
    if (countdownTimer) clearInterval(countdownTimer); countdownTimer = null; Game.notify("Duel!");
});
Events.on("hmp-duels:end", (raw: unknown) => {
    const payload = parse(raw); const result = String(payload.result || "cancelled");
    if (result === "lose") {
        const kneel = Pvp.kneel(); Events.emitServer("hmp-duels:kneel-result", JSON.stringify({ result: kneel }));
        Game.notify(`Defeated — ${String(payload.opponentName || "your opponent")} wins`);
        restoreTimer = setTimeout(reset, 1500); return;
    }
    reset();
    Game.notify(result === "win" ? `Victory over ${String(payload.opponentName || "your opponent")}!` : `Duel ended: ${String(payload.reason || result)}`);
});
Events.on("resourceStop", (name?: string) => { if (!name || name === "hmp-duels") reset(); });
console.info("[hmp-duels] native duel coordinator ready");
