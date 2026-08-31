import type { HmpLibServer } from "../../hmp-lib/types";
import type { NpcsConfig } from "./internal";

function limit(value: unknown, label: string): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 10_000) {
        throw new TypeError(`${label} must be an integer from 1 to 10000`);
    }
    return parsed;
}

export function normalizeConfig(raw: unknown): NpcsConfig {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("hmp-npcs configuration must be an object");
    const value = raw as Record<string, unknown>;
    const maximumManagedNpcs = limit(value.maximumManagedNpcs, "hmp-npcs maximumManagedNpcs");
    const maximumPerResource = limit(value.maximumPerResource, "hmp-npcs maximumPerResource");
    if (maximumPerResource > maximumManagedNpcs) {
        throw new TypeError("hmp-npcs maximumPerResource cannot exceed maximumManagedNpcs");
    }
    return { maximumManagedNpcs, maximumPerResource };
}

export function loadConfig(Hmp: HmpLibServer, options: { env?: NodeJS.ProcessEnv; cwd?: string } = {}): NpcsConfig {
    const env = options.env || process.env;
    const defaults: NpcsConfig = { maximumManagedNpcs: 512, maximumPerResource: 256 };
    const loaded = Hmp.config.load<NpcsConfig & Record<string, unknown>>(env.HMP_NPCS_CONFIG || "data/hmp-npcs.json", {
        cwd: options.cwd || process.cwd(),
        defaults: defaults as NpcsConfig & Record<string, unknown>,
    });
    return normalizeConfig(loaded);
}
