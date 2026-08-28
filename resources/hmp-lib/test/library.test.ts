import assert = require("node:assert");
import fs = require("node:fs");
import os = require("node:os");
import path = require("node:path");
import text = require("../shared/text");
import number = require("../shared/number");
import position = require("../shared/position");
import validation = require("../shared/validation");
import rateLimit = require("../shared/rate-limit");
import locale = require("../shared/locale");
import logger = require("../shared/logger");
import config = require("../server/config");
import playerModule = require("../server/player");
import commandModule = require("../server/command");
import inputModule = require("../client/input");
import type { HmpPlayerLike } from "../types";

const { createPlayerApi } = playerModule;
const { createCommandApi } = commandModule;
const { createInputApi } = inputModule;

function hasCode(error: unknown, code: string): boolean {
    return error instanceof Error && "code" in error && error.code === code;
}

function sharedContracts() {
    assert.strictEqual(text.clean("  hello\t\u0000world  ", 20), "hello world");
    assert.strictEqual(text.clean("one\r\n two\n\n\nthree", { multiline: true, maxLength: 100, maxLines: 3 }), "one\ntwo\n");
    assert.strictEqual(text.slug("  Déjà Vu & Accio!  "), "deja-vu-accio");
    assert.strictEqual(text.isId("robes:open_1"), true);
    assert.strictEqual(text.isId("bad id"), false);
    assert.strictEqual(text.truncate("abcdefgh", 5), "abcd…");

    assert.strictEqual(number.finite("4.5"), 4.5);
    assert.strictEqual(number.finite("bad", 7), 7);
    assert.strictEqual(number.integer("4", 0), 4);
    assert.strictEqual(number.clamp(11, 0, 10), 10);
    assert.strictEqual(number.between(10, 0, 10), true);
    assert.throws(() => number.clamp(1, 2, 1), /minimum/);

    assert.deepStrictEqual(position.read({ position: { x: "1", y: 2, z: 3 } }), { x: 1, y: 2, z: 3 });
    assert.strictEqual(position.distance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }), 5);
    assert.strictEqual(position.within({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }, 5), true);
    assert.strictEqual(position.distance(null as unknown as { x: number; y: number; z: number }, {} as { x: number; y: number; z: number }), Infinity);

    assert.strictEqual(validation.string("  Accio ", { minLength: 2, maxLength: 10 }), "Accio");
    assert.strictEqual(validation.number("7", { coerce: true, integer: true, min: 1 }), 7);
    assert.strictEqual(validation.boolean("off", { coerce: true }), false);
    assert.deepStrictEqual(validation.array(["1", "2"], {
        item: (value, options) => validation.number(value, { ...options, coerce: true, integer: true }),
    }), [1, 2]);
    assert.strictEqual(validation.oneOf("red", ["red", "blue"]), "red");
    assert.throws(() => validation.string("", { name: "spell", minLength: 1 }), /spell/);
    assert.throws(() => validation.number(NaN), /finite number/);

    let clock = 1000;
    let dropped = 0;
    const limiter = rateLimit.create({ limit: 2, windowMs: 100, now: () => clock, onDrop: () => dropped++ });
    assert.strictEqual(limiter.allow("wizard"), true);
    assert.strictEqual(limiter.allow("wizard"), true);
    assert.strictEqual(limiter.allow("wizard"), false);
    assert.strictEqual(dropped, 1);
    assert.deepStrictEqual(limiter.check("wizard"), {
        key: "wizard", allowed: false, limit: 2, used: 2, remaining: 0, dropped: 1, resetAt: 1100,
    });
    clock = 1100;
    assert.strictEqual(limiter.allow("wizard"), true);
    clock = 1400;
    assert.strictEqual(limiter.sweep(), 1);

    const language = locale.create({
        en: { greeting: "Welcome, {name}.", nested: { value: "fallback" } },
        fr: { greeting: "Bienvenue, {name}." },
    }, { locale: "fr", fallback: "en" });
    assert.strictEqual(language.t("greeting", { name: "Poppy" }), "Bienvenue, Poppy.");
    assert.strictEqual(language.t("nested.value"), "fallback");
    assert.strictEqual(language.t("missing.key"), "missing.key");
    language.setLocale("en");
    assert.strictEqual(language.getLocale(), "en");

    const calls: unknown[][] = [];
    const write = (level: string, args: unknown[]): void => { calls.push([level, ...args]); };
    const sink: Pick<Console, "debug" | "info" | "warn" | "error" | "log"> = {
        debug: (...args: unknown[]) => write("debug", args),
        info: (...args: unknown[]) => write("info", args),
        warn: (...args: unknown[]) => write("warn", args),
        error: (...args: unknown[]) => write("error", args),
        log: (...args: unknown[]) => write("log", args),
    };
    const log = logger.create("robes", { level: "warn", sink });
    assert.strictEqual(log.info("hidden"), false);
    assert.strictEqual(log.warn("visible"), true);
    log.child("shop", { id: 7 }).error("failed");
    assert.deepStrictEqual(calls[0], ["warn", "[robes]", "visible"]);
    assert.deepStrictEqual(calls[1], ["error", "[robes:shop]", "failed", { id: 7 }]);
}

function configContract() {
    const merged = config.merge<Record<string, unknown>>(
        { enabled: true, nested: { first: 1 }, list: [1] },
        { nested: { second: 2 }, list: [2] },
        JSON.parse('{"__proto__":{"polluted":true}}'),
    );
    assert.deepStrictEqual(merged, { enabled: true, nested: { first: 1, second: 2 }, list: [2] });
    assert.strictEqual(({} as Record<string, unknown>).polluted, undefined);
    assert.strictEqual(config.env.boolean("yes"), true);
    assert.strictEqual(config.env.boolean("off"), false);
    assert.strictEqual(config.env.number("12", 0, { integer: true, min: 1 }), 12);
    assert.deepStrictEqual(config.env.json('{"house":"Ravenclaw"}'), { house: "Ravenclaw" });

    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "hmp-lib-test-"));
    try {
        const file = path.join(temp, "resource.config.js");
        fs.writeFileSync(file, "module.exports = { nested: { configured: true }, limit: 4 };\n");
        const loaded = config.load(file, { defaults: { enabled: true, nested: { defaulted: true } }, required: true });
        assert.deepStrictEqual(loaded, {
            enabled: true,
            nested: { defaulted: true, configured: true },
            limit: 4,
        });
        assert.deepStrictEqual(config.load("missing.js", { cwd: temp, defaults: { enabled: false } }), { enabled: false });
        assert.throws(() => config.load("missing.js", { cwd: temp, required: true }), (error) => hasCode(error, "HMP_CONFIG_NOT_FOUND"));
    } finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
}

async function playerAndCommandContract() {
    const chats: Array<[number, string]> = [];
    const players: HmpPlayerLike[] = [
        { id: 1, nickname: "Poppy", connected: true, sendChat: (message: string) => { chats.push([1, message]); } },
        { id: 2, nickname: "Natsai", connected: true, sendChat: (message: string) => { chats.push([2, message]); } },
        { id: 3, nickname: "natsai", connected: true, sendChat: (message: string) => { chats.push([3, message]); } },
    ];
    const player = createPlayerApi(() => players);
    assert.strictEqual(player.byId("1"), players[0]);
    assert.strictEqual(player.find("me", players[1]), players[1]);
    assert.strictEqual(player.find("#2"), players[1]);
    assert.strictEqual(player.resolve("NATSAI").reason, "ambiguous");
    assert.strictEqual(player.find("Natsai", null, { caseSensitive: true }), players[1]);
    assert.strictEqual(player.format(players[0]), "Poppy (#1)");

    const errors: unknown[] = [];
    const commands = createCommandApi({ player, logger: { error: (message: unknown) => errors.push(message) > 0 } });
    const router = commands.createRouter({ prefix: "[test]" });
    let handled = 0;
    const remove = router.register("greet", {
        aliases: ["hello"],
        usage: "/greet <player>",
        guard: ({ args }) => args[0] ? true : "Choose a player.",
    }, ({ args, findPlayer, reply }) => {
        handled++;
        reply(`Hello ${findPlayer(args[0])?.nickname}.`);
    });

    assert.strictEqual(await router.handle(players[0], "/hello #2", "hello", ["#2"]), true);
    assert.strictEqual(handled, 1);
    assert.deepStrictEqual(chats.pop(), [1, "[test] Hello Natsai."]);
    assert.strictEqual(await router.handle(players[0], "/greet", "greet", []), true);
    assert.deepStrictEqual(chats.pop(), [1, "[test] Choose a player."]);
    assert.strictEqual(await router.handle(players[0], "/unknown", "unknown", []), false);
    assert.strictEqual(router.list().length, 1);
    assert.strictEqual(remove(), true);
    assert.strictEqual(router.get("greet"), null);

    router.register("fail", () => { throw new Error("expected command failure"); });
    await router.handle(players[0], "/fail", "fail", []);
    assert.match(String(errors[0]), /expected command failure/);
    assert.deepStrictEqual(chats.pop(), [1, "[test] The command could not be completed."]);
}

function inputContract() {
    const bound = new Map<string, (key: string, state: "down" | "up") => void>();
    const controlCalls: boolean[] = [];
    const warnings: unknown[][] = [];
    let physicalDown = false;
    const input = createInputApi({
        key: {
            bind(key: string, _state: "both", handler: (key: string, state: "down" | "up") => void) { bound.set(key, handler); return true; },
            unbind(key: string, _state: "both", handler: (key: string, state: "down" | "up") => void) { if (bound.get(key) !== handler) return false; return bound.delete(key); },
            isDown: () => physicalDown,
        },
        game: { lockControls(value: boolean) { controlCalls.push(value); }, areControlsLocked: () => controlCalls.at(-1) === true },
        console: { warn: (...args: unknown[]) => warnings.push(args), error: () => undefined },
    });

    const inventory = input.controls.acquire({ resource: "hmp-inventory", id: "screen" });
    const characters = input.controls.acquire({ resource: "hmp-characters", id: "screen" });
    assert.deepStrictEqual(controlCalls, [true]);
    assert.strictEqual(inventory.release(), true);
    assert.deepStrictEqual(controlCalls, [true]);
    assert.strictEqual(input.cleanup("hmp-characters"), 1);
    assert.deepStrictEqual(controlCalls, [true, false]);
    assert.strictEqual(characters.release(), false);
    assert.throws(() => input.controls.acquire({ resource: "bad resource", id: "screen" }), /namespaced identifier/);

    const fired: string[] = [];
    input.shortcuts.register({ resource: "hmp-interact", id: "use", key: "f", priority: 0, handler: () => fired.push("interact") });
    input.shortcuts.register({ resource: "hmp-spell", id: "cast", key: "f", priority: 10, handler: () => fired.push("spell") });
    bound.get("f")?.("f", "down");
    assert.deepStrictEqual(fired, ["spell"]);
    input.shortcuts.register({ resource: "hmp-duel", id: "cast", key: "f", priority: 10, handler: () => fired.push("duel") });
    bound.get("f")?.("f", "down");
    assert.deepStrictEqual(fired, ["spell"]);
    assert.strictEqual(warnings.length, 1);
    assert.strictEqual(input.status().conflicts, 1);
    assert.strictEqual(input.shortcuts.setEnabled("cast", false, "hmp-duel"), true);
    bound.get("f")?.("f", "down");
    assert.deepStrictEqual(fired, ["spell", "spell"]);
    assert.strictEqual(input.shortcuts.rebind("cast", "g", "hmp-spell"), true);
    assert.ok(bound.has("g"));
    assert.strictEqual(input.cleanup("hmp-spell"), 1);
    assert.strictEqual(bound.has("g"), false);
    physicalDown = true;
    assert.strictEqual(input.shortcuts.isDown("f"), true);
    input.stop();
    assert.strictEqual(bound.size, 0);
}

(async () => {
    sharedContracts();
    configContract();
    inputContract();
    await playerAndCommandContract();
    console.log("hmp-lib source contract passed");
})().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
// Source-level TypeScript tests.
