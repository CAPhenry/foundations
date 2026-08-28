import serviceModule = require("./service");
import type { HmpCore } from "../../hmp-core/types";
import type { HmpLibServer } from "../../hmp-lib/types";
import type { HmpPvpHit } from "../types";

const { createPvpService } = serviceModule;
const Hmp = Imports.get<HmpLibServer<HogwartsMpPlayer>>("hmp-lib");
const core = Imports.get<HmpCore<HogwartsMpPlayer>>("hmp-core");
const logger = Hmp.logger.create("hmp-pvp");

interface Config {
    defaultDecision: "allow" | "deny";
    lethalMode: boolean;
    enableCommands: boolean;
    command: string;
    joinSyncDelayMs: number;
    adminGroups: Array<{ key: string; minimumGrade?: number }>;
}

const configured = Hmp.config.load<Config & Record<string, unknown>>(
    process.env.HMP_PVP_CONFIG || "data/hmp-pvp.json",
    {
        defaults: {
            defaultDecision: "deny",
            lethalMode: false,
            enableCommands: true,
            command: "pvp",
            joinSyncDelayMs: 3000,
            adminGroups: [{ key: "admin", minimumGrade: 1 }],
        },
    },
);

if (configured.defaultDecision !== "allow" && configured.defaultDecision !== "deny") {
    throw new TypeError("hmp-pvp defaultDecision must be allow or deny");
}
if (!Array.isArray(configured.adminGroups)) {
    throw new TypeError("hmp-pvp adminGroups must be an array");
}

const command = String(configured.command || "pvp").trim().toLowerCase();
if (!/^[a-z0-9_-]{1,40}$/.test(command)) {
    throw new TypeError("hmp-pvp command is invalid");
}

const joinSyncDelayMs = Math.max(
    0,
    Math.min(30_000, Math.floor(Number(configured.joinSyncDelayMs) || 3000)),
);
const joinTimers = new Map<number, ReturnType<typeof setTimeout>>();

function syncMode(enabled: boolean, playerId?: number): void {
    const recipients = playerId === undefined
        ? PlayerManager.getAll()
        : (() => {
            const player = PlayerManager.getById(playerId);
            return player ? [player] : [];
        })();
    const all = PlayerManager.getAll();

    for (const player of recipients) {
        player.emit(
            "hmp-pvp:mode",
            JSON.stringify({
                enabled,
                playerIds: enabled
                    ? all
                        .filter((other) => other.id !== player.id)
                        .map((other) => other.id)
                    : [],
            }),
        );
    }
}

const pvp = createPvpService({
    defaultDecision: configured.defaultDecision,
    initialLethalMode: configured.lethalMode === true,
    install: (policy) => {
        Pvp.setPolicy((hit) => policy(hit as HmpPvpHit));
    },
    clearPolicy: () => {
        Pvp.setPolicy(null);
    },
    vitals: (id) => Pvp.getVitals(id),
    applyMode: syncMode,
    modeChanged: (enabled, context) => {
        Events.emit("hmp:pvp:lethal-mode-changed", { enabled, ...context });
    },
    warn: (message) => logger.warn(message),
});

Exports.register("policy", pvp.policy);
Exports.register("mode", pvp.mode);
Exports.register("vitals", pvp.vitals);
Exports.register("status", pvp.status);

function delayedSync(player: HogwartsMpPlayer): void {
    if (!pvp.mode.isLethal()) return;

    const playerId = Number(player.id);
    const existing = joinTimers.get(playerId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
        joinTimers.delete(playerId);
        // Re-send complete snapshots to both the joiner and existing players. A one-sided
        // sync would let the joiner target everyone without making the joiner targetable.
        pvp.mode.sync();
    }, joinSyncDelayMs);
    timer.unref?.();
    joinTimers.set(playerId, timer);
}

Events.on("playerConnect", delayedSync);
Events.on("hmp:session:ready", (session: unknown) => {
    const player = session && typeof session === "object" && "player" in session
        ? (session.player as HogwartsMpPlayer)
        : null;
    if (player) delayedSync(player);
});
Events.on("pvp:lethalMode", (enabled: unknown) => {
    pvp.mode.setLethal(enabled === true, {
        resource: "pvp:lethalMode",
        reason: "compatibility event",
    });
});
Events.on("resourceStop", (name?: string) => {
    if (!name || name === "hmp-pvp") {
        for (const timer of joinTimers.values()) clearTimeout(timer);
        joinTimers.clear();
        pvp.stop();
    } else {
        pvp.cleanup(name);
    }
});

async function isAdmin(player: HogwartsMpPlayer): Promise<boolean> {
    const checks = await Promise.all(
        configured.adminGroups.map((group) => core.groups.has(
            player,
            String(group.key).toLowerCase(),
            Number(group.minimumGrade) || 0,
        )),
    );
    return checks.some(Boolean);
}

function announce(message: string): void {
    for (const player of PlayerManager.getAll()) {
        player.sendChat?.(`[pvp] ${message}`);
    }
}

if (configured.enableCommands !== false) {
    Events.on(
        "chatCommand",
        (player: HogwartsMpPlayer, _message: unknown, rawCommand: unknown, rawArgs: unknown) => {
            const invoked = String(rawCommand || "").toLowerCase();
            if (invoked !== command && invoked !== "pvpstatus") return;

            const args = Array.isArray(rawArgs) ? rawArgs.map(String) : [];
            const reply = (message: string) => player.sendChat?.(`[pvp] ${message}`);

            void (async () => {
                const action = invoked === "pvpstatus"
                    ? "status"
                    : String(args[0] || "status").toLowerCase();

                if (action === "status") {
                    const status = pvp.status();
                    reply(
                        `${status.lethalMode ? "LETHAL" : "consent-only"}; `
                        + `${status.rules} rule(s), ${status.allowed} allowed / `
                        + `${status.denied} denied / ${status.errors} errors`,
                    );
                    return;
                }

                if (!await isAdmin(player)) {
                    reply("You do not have permission to change PvP mode.");
                    return;
                }

                if (action === "sync") {
                    pvp.mode.sync();
                    reply("PvP presentation re-sent to every connected player.");
                    return;
                }

                if (action === "lethal") {
                    const enabled = String(args[1] || "on").toLowerCase() !== "off";
                    const changed = pvp.mode.setLethal(enabled, {
                        resource: "hmp-pvp:command",
                        actor: player,
                        reason: "staff command",
                    });
                    announce(
                        `open-world LETHAL PvP ${enabled
                            ? "ON — everyone is targetable and lethal spells can cause real death"
                            : "off — consent-only rules restored"}`,
                    );
                    if (!changed) {
                        pvp.mode.sync();
                        reply(
                            "Mode was already set; presentation was re-sent to streamed proxies.",
                        );
                    }
                    return;
                }

                reply(`Usage: /${command} <status|lethal on|lethal off|sync>`);
            })().catch((error) => {
                reply(error instanceof Error ? error.message : String(error));
            });
        },
    );
}

logger.info(
    `PvP policy broker ready; ${pvp.mode.isLethal()
        ? "LETHAL mode"
        : `default ${configured.defaultDecision}`}`,
);
