import type { HmpLibServer } from "../../hmp-lib/types";
import type { HmpActivityPlayer } from "../types";
import type { ActivityConfig } from "./internal";

function positive(value: unknown, fallback: number, maximum: number): number {
    const parsed = Math.floor(Number(value));
    return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

export function loadConfig(Hmp: HmpLibServer<HmpActivityPlayer>, options: { env?: NodeJS.ProcessEnv; cwd?: string } = {}): ActivityConfig {
    const env = options.env || process.env;
    const defaults: ActivityConfig = {
        command: "activities", enableCommands: true, maxDefinitions: 128, maxSessions: 256,
        maxMetadataBytes: 16_384, maxInvitations: 512, defaultInvitationTtlSeconds: 30, maximumInvitationTtlSeconds: 600,
        defaultLobbyTtlSeconds: 1800, maximumLobbyTtlSeconds: 21_600,
        sweepIntervalSeconds: 30, enableTestActivity: false,
    };
    const loaded = Hmp.config.load<ActivityConfig & Record<string, unknown>>(env.HMP_ACTIVITIES_CONFIG || "data/hmp-activities.json", {
        cwd: options.cwd || process.cwd(), defaults: defaults as ActivityConfig & Record<string, unknown>,
    });
    const command = String(env.HMP_ACTIVITIES_COMMAND || loaded.command || "activities").trim().toLowerCase();
    if (!/^[a-z0-9_-]{1,40}$/.test(command)) throw new TypeError("hmp-activities command is invalid");
    return {
        command,
        enableCommands: env.HMP_ACTIVITIES_COMMANDS === undefined ? loaded.enableCommands !== false : Hmp.config.env.boolean(env.HMP_ACTIVITIES_COMMANDS, true),
        maxDefinitions: positive(loaded.maxDefinitions, defaults.maxDefinitions, 1024),
        maxSessions: positive(loaded.maxSessions, defaults.maxSessions, 4096),
        maxMetadataBytes: positive(loaded.maxMetadataBytes, defaults.maxMetadataBytes, 131_072),
        maxInvitations: positive(loaded.maxInvitations, defaults.maxInvitations, 8192),
        defaultInvitationTtlSeconds: positive(loaded.defaultInvitationTtlSeconds, defaults.defaultInvitationTtlSeconds, 600),
        maximumInvitationTtlSeconds: positive(loaded.maximumInvitationTtlSeconds, defaults.maximumInvitationTtlSeconds, 3600),
        defaultLobbyTtlSeconds: positive(loaded.defaultLobbyTtlSeconds, defaults.defaultLobbyTtlSeconds, 21_600),
        maximumLobbyTtlSeconds: positive(loaded.maximumLobbyTtlSeconds, defaults.maximumLobbyTtlSeconds, 86_400),
        sweepIntervalSeconds: positive(loaded.sweepIntervalSeconds, defaults.sweepIntervalSeconds, 300),
        enableTestActivity: env.HMP_ACTIVITIES_TEST_ACTIVITY === undefined ? loaded.enableTestActivity === true : Hmp.config.env.boolean(env.HMP_ACTIVITIES_TEST_ACTIVITY, false),
    };
}
