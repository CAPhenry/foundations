const text = require("../shared/text");
const number = require("../shared/number");
const position = require("../shared/position");
const validation = require("../shared/validation");
const rateLimit = require("../shared/rate-limit");
const locale = require("../shared/locale");
const logger = require("../shared/logger");
const { createInputApi } = require("./input");

const input = createInputApi({ key: Key, game: Game, console });
const api = { text, number, position, validation, rateLimit, locale, logger, input };
for (const [name, value] of Object.entries(api)) Exports.register(name, value);

Events.on("resourceStop", (name?: string) => {
    if (!name || name === "hmp-lib") input.stop();
    else input.cleanup(name);
});

console.info("[hmp-lib] client utilities ready");
// TypeScript source.
