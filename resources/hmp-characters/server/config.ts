import type { HmpLibServer } from "../../hmp-lib/types";
import type { CharacterConfig, Player } from "./internal";

function loadConfig(Hmp: HmpLibServer<Player>, options: { env?: NodeJS.ProcessEnv; cwd?: string } = {}): CharacterConfig {
    const env = options.env || process.env;
    const cwd = options.cwd || process.cwd();
    const defaults: CharacterConfig = {
        autoOpenOnJoin: true,
        allowDelete: true,
        allowCloseWithActiveCharacter: true,
        command: "characters",
        appearancePollMs: 200,
        appearanceTimeoutMs: 6000,
        title: "Choose Your Wizard",
        subtitle: "Every story begins with a name.",
    };
    const config = Hmp.config.load<CharacterConfig>(env.HMP_CHARACTERS_CONFIG || "data/hmp-characters.json", { cwd, defaults });
    if (env.HMP_CHARACTERS_AUTO_OPEN) config.autoOpenOnJoin = Hmp.config.env.boolean(env.HMP_CHARACTERS_AUTO_OPEN);
    if (env.HMP_CHARACTERS_ALLOW_DELETE) config.allowDelete = Hmp.config.env.boolean(env.HMP_CHARACTERS_ALLOW_DELETE);
    if (env.HMP_CHARACTERS_COMMAND) config.command = String(env.HMP_CHARACTERS_COMMAND).trim().toLowerCase();
    config.appearancePollMs = Math.max(50, Math.min(1000, Math.trunc(Number(config.appearancePollMs)) || 200));
    config.appearanceTimeoutMs = Math.max(500, Math.min(15000, Math.trunc(Number(config.appearanceTimeoutMs)) || 6000));
    return config;
}

export = { loadConfig };
// TypeScript source.
