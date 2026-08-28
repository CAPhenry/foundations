const text = require("../shared/text");
const number = require("../shared/number");
const position = require("../shared/position");
const validation = require("../shared/validation");
const rateLimit = require("../shared/rate-limit");
const locale = require("../shared/locale");
const logger = require("../shared/logger");
const config = require("./config");
const { createPlayerApi } = require("./player");
const { createCommandApi } = require("./command");

const player = createPlayerApi(() => PlayerManager.getAll());
const command = createCommandApi({ player, logger: logger.create("hmp-command") });
const api = { text, number, position, validation, rateLimit, locale, logger, config, player, command };

for (const [name, value] of Object.entries(api)) Exports.register(name, value);

console.info("[hmp-lib] server utilities ready");
// TypeScript source.
