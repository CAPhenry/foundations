const fs = require("fs");
const path = require("path");

const DEFAULT_CONFIG_PATH = path.join("data", "hmp-mysql.json");

function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
}

function booleanValue(value, fallback) {
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value === "boolean") return value;
    const normalized = String(value).trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    throw new TypeError(`Expected a boolean value, received '${value}'`);
}

function integerValue(value, fallback, name, minimum, maximum) {
    if (value === undefined || value === null || value === "") return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
        throw new TypeError(`${name} must be an integer from ${minimum} to ${maximum}`);
    }
    return parsed;
}

function decode(value) {
    try { return decodeURIComponent(value); }
    catch (_) { return value; }
}

function parseConnectionUrl(value) {
    if (!value) return {};
    const url = new URL(value);
    if (url.protocol !== "mysql:" && url.protocol !== "mariadb:") {
        throw new TypeError("HMP_MYSQL_URL must use mysql:// or mariadb://");
    }
    return {
        host: url.hostname || undefined,
        port: url.port || undefined,
        user: url.username ? decode(url.username) : undefined,
        password: url.password ? decode(url.password) : undefined,
        database: url.pathname && url.pathname !== "/" ? decode(url.pathname.slice(1)) : undefined,
    };
}

function readJsonConfig(configPath) {
    if (!fs.existsSync(configPath)) return { exists: false, value: {} };
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new TypeError(`${configPath} must contain a JSON object`);
    }
    return { exists: true, value: parsed };
}

function envOrFile(env, envName, file, fileName, fallback) {
    if (own(env, envName) && env[envName] !== "") return env[envName];
    if (own(file, fileName)) return file[fileName];
    return fallback;
}

function loadConfig(options = {}) {
    const env = options.env || process.env;
    const cwd = options.cwd || process.cwd();
    const requestedPath = env.HMP_MYSQL_CONFIG || options.configPath || DEFAULT_CONFIG_PATH;
    const configPath = path.resolve(cwd, requestedPath);
    const loaded = readJsonConfig(configPath);
    const file = loaded.value;
    const connectionUrl = env.HMP_MYSQL_URL || file.url || "";
    const fromUrl = parseConnectionUrl(connectionUrl);

    const explicitlyEnabled = envOrFile(env, "HMP_MYSQL_ENABLED", file, "enabled", undefined);
    const connectionEnvNames = [
        "HMP_MYSQL_HOST",
        "HMP_MYSQL_PORT",
        "HMP_MYSQL_USER",
        "HMP_MYSQL_PASSWORD",
        "HMP_MYSQL_DATABASE",
    ];
    const configuredByEnvironment = connectionEnvNames.some((name) => own(env, name) && env[name] !== "");
    const configured = Boolean(connectionUrl || loaded.exists || configuredByEnvironment);
    const enabled = booleanValue(explicitlyEnabled, configured);

    const host = envOrFile(env, "HMP_MYSQL_HOST", file, "host", fromUrl.host || "127.0.0.1");
    const port = integerValue(
        envOrFile(env, "HMP_MYSQL_PORT", file, "port", fromUrl.port),
        3306,
        "port",
        1,
        65535,
    );
    const user = envOrFile(env, "HMP_MYSQL_USER", file, "user", fromUrl.user || "root");
    const password = envOrFile(env, "HMP_MYSQL_PASSWORD", file, "password", fromUrl.password || "");
    const database = envOrFile(env, "HMP_MYSQL_DATABASE", file, "database", fromUrl.database || "hogwartsmp");
    const connectionLimit = integerValue(
        envOrFile(env, "HMP_MYSQL_CONNECTION_LIMIT", file, "connectionLimit", undefined),
        10,
        "connectionLimit",
        1,
        1000,
    );
    const queueLimit = integerValue(
        envOrFile(env, "HMP_MYSQL_QUEUE_LIMIT", file, "queueLimit", undefined),
        0,
        "queueLimit",
        0,
        1000000,
    );
    const connectTimeout = integerValue(
        envOrFile(env, "HMP_MYSQL_CONNECT_TIMEOUT", file, "connectTimeout", undefined),
        10000,
        "connectTimeout",
        100,
        300000,
    );
    const sslEnabled = booleanValue(
        envOrFile(env, "HMP_MYSQL_SSL", file, "ssl", false),
        false,
    );

    const pool = {
        host,
        port,
        user,
        password,
        database,
        waitForConnections: true,
        connectionLimit,
        queueLimit,
        connectTimeout,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        charset: envOrFile(env, "HMP_MYSQL_CHARSET", file, "charset", "utf8mb4"),
        timezone: envOrFile(env, "HMP_MYSQL_TIMEZONE", file, "timezone", "Z"),
        namedPlaceholders: true,
        supportBigNumbers: true,
        bigNumberStrings: true,
        dateStrings: booleanValue(file.dateStrings, true),
        multipleStatements: false,
    };
    if (sslEnabled) pool.ssl = { rejectUnauthorized: true };

    return {
        enabled,
        source: loaded.exists ? configPath : (connectionUrl || configuredByEnvironment ? "environment" : "none"),
        target: `${host}:${port}/${database}`,
        pool,
    };
}

module.exports = { DEFAULT_CONFIG_PATH, loadConfig, parseConnectionUrl };
