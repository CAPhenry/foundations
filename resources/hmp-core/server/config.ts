import type { HmpLibServer } from "../../hmp-lib/types";
import type { CoreConfig, Player } from "./internal";

function loadConfig(Hmp: HmpLibServer<Player>, options: { env?: NodeJS.ProcessEnv; cwd?: string } = {}): CoreConfig {
    const env = options.env || process.env;
    const cwd = options.cwd || process.cwd();
    const defaults: CoreConfig = {
        maxCharacters: 4,
        autoSelectSingleCharacter: false,
        duplicateSession: "reject-new",
        kickDuplicateSession: false,
        identityOrder: ["steamId", "discordId", "hardwareId"],
    };
    const config = Hmp.config.load<CoreConfig>(env.HMP_CORE_CONFIG || "data/hmp-core.json", { cwd, defaults });
    if (env.HMP_CORE_MAX_CHARACTERS) {
        config.maxCharacters = Hmp.config.env.number(env.HMP_CORE_MAX_CHARACTERS, config.maxCharacters, { integer: true, min: 1, max: 32 }) ?? config.maxCharacters;
    }
    if (env.HMP_CORE_AUTO_SELECT_SINGLE) config.autoSelectSingleCharacter = Hmp.config.env.boolean(env.HMP_CORE_AUTO_SELECT_SINGLE);
    if (env.HMP_CORE_KICK_DUPLICATE) config.kickDuplicateSession = Hmp.config.env.boolean(env.HMP_CORE_KICK_DUPLICATE);
    if (env.HMP_CORE_IDENTITY_ORDER) config.identityOrder = env.HMP_CORE_IDENTITY_ORDER.split(",").map((value) => value.trim()).filter(Boolean);
    if (!Array.isArray(config.identityOrder) || !config.identityOrder.length) throw new TypeError("hmp-core identityOrder must not be empty");
    if (!["reject-new", "replace-old"].includes(config.duplicateSession)) throw new TypeError("hmp-core duplicateSession must be reject-new or replace-old");
    return config;
}

export = { loadConfig };
// TypeScript source.
