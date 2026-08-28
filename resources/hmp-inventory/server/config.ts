import type { InventoryConfig, Lib } from "./internal";

function loadConfig(Hmp: Lib, options: { env?: NodeJS.ProcessEnv; cwd?: string } = {}): InventoryConfig {
    const env = options.env || process.env;
    const cwd = options.cwd || process.cwd();
    const defaults = {
        slots: 36,
        maxWeight: 60,
        autoSaveMs: 30000,
        allowInventoryCommand: true,
        items: [],
        ui: {
            url: "http://resources/hmp-inventory/dist/index.html",
        },
    };
    const config = Hmp.config.load<InventoryConfig>(env.HMP_INVENTORY_CONFIG || "data/hmp-inventory.json", { cwd, defaults });
    config.slots = Math.max(1, Math.min(200, Math.trunc(Number(config.slots)) || defaults.slots));
    config.maxWeight = Math.max(0, Math.min(100000, Number(config.maxWeight) || defaults.maxWeight));
    config.autoSaveMs = Math.max(0, Math.min(3600000, Math.trunc(Number(config.autoSaveMs)) || 0));
    if (env.HMP_INVENTORY_COMMAND) config.allowInventoryCommand = Hmp.config.env.boolean(env.HMP_INVENTORY_COMMAND);
    if (!config.ui || typeof config.ui !== "object") config.ui = { ...defaults.ui };
    if (env.HMP_INVENTORY_UI_URL) config.ui.url = String(env.HMP_INVENTORY_UI_URL).trim();
    config.ui.url = String(config.ui.url || defaults.ui.url).trim();
    if (!config.ui.url.startsWith("http://resources/") && !config.ui.url.startsWith("https://")) {
        throw new TypeError("hmp-inventory ui.url must be a resource URL or an HTTPS URL");
    }
    if (!Array.isArray(config.items)) throw new TypeError("hmp-inventory items must be an array");
    return config;
}

export = { loadConfig };
// TypeScript source.
