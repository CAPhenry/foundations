import type { HmpLibServer } from "../../hmp-lib/types";
import type { HmpHousePlayer } from "../types";
import type { HouseConfig } from "./internal";

function clean(value: unknown, label: string, maximum = 64): string {
    const result = String(value || "").trim();
    if (!result || result.length > maximum) throw new TypeError(`${label} must be a non-empty string up to ${maximum} characters`);
    return result;
}

function loadConfig(Hmp: HmpLibServer<HmpHousePlayer>, options: { env?: NodeJS.ProcessEnv; cwd?: string } = {}): HouseConfig {
    const env = options.env || process.env;
    const defaults: HouseConfig = {
        enableCommands: true,
        houseCommand: "house",
        pointsCommand: "points",
        adminGroups: [{ key: "admin", minimumGrade: 1 }],
        groupPrefix: "house:",
        allowNegativePoints: true,
    };
    const loaded = Hmp.config.load<HouseConfig & Record<string, unknown>>(env.HMP_HOUSES_CONFIG || "data/hmp-houses.json", {
        cwd: options.cwd || process.cwd(), defaults: defaults as HouseConfig & Record<string, unknown>,
    });
    if (!Array.isArray(loaded.adminGroups)) throw new TypeError("hmp-houses adminGroups must be an array");
    const adminGroups = loaded.adminGroups.map((entry, index) => ({
        key: clean(entry?.key, `admin group ${index} key`).toLowerCase(),
        minimumGrade: Number.isSafeInteger(Number(entry?.minimumGrade)) ? Number(entry.minimumGrade) : 0,
    }));
    const groupPrefix = clean(loaded.groupPrefix || "house:", "hmp-houses groupPrefix", 48).toLowerCase();
    return {
        enableCommands: env.HMP_HOUSES_COMMANDS === undefined ? loaded.enableCommands !== false : Hmp.config.env.boolean(env.HMP_HOUSES_COMMANDS, true),
        houseCommand: clean(env.HMP_HOUSES_HOUSE_COMMAND || loaded.houseCommand || "house", "house command").toLowerCase(),
        pointsCommand: clean(env.HMP_HOUSES_POINTS_COMMAND || loaded.pointsCommand || "points", "points command").toLowerCase(),
        adminGroups,
        groupPrefix,
        allowNegativePoints: env.HMP_HOUSES_ALLOW_NEGATIVE === undefined ? loaded.allowNegativePoints !== false : Hmp.config.env.boolean(env.HMP_HOUSES_ALLOW_NEGATIVE, true),
    };
}

export = { loadConfig };
