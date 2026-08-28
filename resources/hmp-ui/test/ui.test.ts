import assert = require("node:assert");
import { test } from "node:test";
import normalizeModule = require("../shared/normalize");
import serverModule = require("../server/ui");
import clientModule = require("../client/ui");
import type { HmpUiPlayer } from "../types";

const { normalizeNotification, normalizeInput, normalizeContext, normalizeProgress } = normalizeModule;
const { createUiService } = serverModule;
const { createUiClient } = clientModule;

const parse = (value: unknown): Record<string, unknown> => JSON.parse(String(value)) as Record<string, unknown>;
const logger = { warn: () => true, error: () => true };

test("normalizes bounded plain-text UI contracts", () => {
    assert.deepStrictEqual(normalizeNotification("Welcome"), { title: undefined, description: "Welcome", tone: "inform", duration: 4500 });
    assert.throws(() => normalizeInput({ title: "Bad", fields: [{ name: "same", label: "One" }, { name: "same", label: "Two" }] }), /duplicate/);
    assert.strictEqual(normalizeInput({ title: "Secret", fields: [{ name: "secret", label: "Secret", type: "password" }] }).fields[0].type, "password");
    assert.throws(() => normalizeContext({ title: "Bad", options: [{ id: "spaces are invalid", title: "No" }] }), /invalid/);
    const icons = normalizeContext({ title: "Icons", options: [{ id: "safe", title: "Safe", icon: "http://resources/items/icon.svg" }, { id: "unsafe", title: "Unsafe", icon: "javascript:alert(1)" }] });
    assert.strictEqual(icons.options[0].icon, "http://resources/items/icon.svg");
    assert.strictEqual(icons.options[1].icon, undefined);
    assert.strictEqual(normalizeProgress({ label: "Casting", duration: 999999 }).duration, 600000);
});

test("server correlates responses and revalidates client selections", async () => {
    const sent: Array<{ name: string; payload: unknown }> = [];
    const player: HmpUiPlayer = { id: 7, emit: (name, payload) => sent.push({ name, payload }) };
    const ui = createUiService<HmpUiPlayer>({ logger, now: () => 100 });

    const alert = ui.alert(player, { title: "Leave?", content: "Unsaved work", cancel: true });
    const alertRequest = parse(sent.at(-1)?.payload);
    assert.strictEqual(alertRequest.type, "alert");
    assert.strictEqual(ui.onResponse(player, JSON.stringify({ id: alertRequest.id, result: "confirm" })), true);
    assert.strictEqual(await alert, "confirm");

    const context = ui.context(player, { title: "Actions", options: [{ id: "inspect", title: "Inspect" }, { id: "locked", title: "Locked", disabled: true }] });
    const contextRequest = parse(sent.at(-1)?.payload);
    assert.strictEqual(ui.onResponse(player, { id: contextRequest.id, result: "locked" }), true);
    await assert.rejects(context, /not offered/);

    const input = ui.input(player, { title: "Amount", fields: [{ name: "amount", label: "Amount", type: "number", min: 1, max: 5 }] });
    const inputRequest = parse(sent.at(-1)?.payload);
    ui.onResponse(player, { id: inputRequest.id, result: { amount: "3", ignored: "no" } });
    assert.deepStrictEqual(await input, { amount: 3 });
    assert.strictEqual(ui.status().pending, 0);
});

test("server notifications are fire-and-forget and disconnect settles pending work", async () => {
    const sent: Array<{ name: string; payload: unknown }> = [];
    const player: HmpUiPlayer = { id: 9, emit: (name, payload) => sent.push({ name, payload }) };
    const ui = createUiService<HmpUiPlayer>({ logger });
    assert.strictEqual(ui.notify(player, { description: "Done", tone: "success" }), true);
    assert.strictEqual(sent[0].name, "hmp-ui:notify");
    const progress = ui.progress(player, { label: "Working", duration: 1000 });
    assert.strictEqual(ui.disconnect(player), 1);
    assert.strictEqual(await progress, false);
});

test("client queues until the page is ready and balances focus on completion", async () => {
    const handlers = new Map<string, (payload?: unknown) => unknown>();
    const pageEvents: Array<{ name: string; payload: unknown }> = [];
    const serverEvents: Array<{ name: string; payload: unknown }> = [];
    let shown = 0;
    let hidden = 0;
    let focused = 0;
    let leases = 0;
    let releases = 0;
    const web = {
        createView: () => 4,
        destroyView: () => true,
        showView: () => { shown++; return true; },
        hideView: () => { hidden++; return true; },
        focusView: () => { focused++; return true; },
        emit: (_view: number, name: string, payload?: unknown) => { pageEvents.push({ name, payload }); return true; },
        on: (_view: number, name: string, listener: (payload?: unknown) => unknown) => handlers.set(name, listener),
    };
    const ui = createUiClient({
        web,
        events: { emitServer: (name, payload) => serverEvents.push({ name, payload }) },
        input: { controls: { acquire() { leases++; return { release() { releases++; return true; } }; } } },
    });
    const answer = ui.alert({ title: "Question" });
    assert.strictEqual(pageEvents.length, 0);
    handlers.get("ready")?.();
    const request = pageEvents.find((event) => event.name === "request")?.payload as { id: string };
    assert.ok(request.id);
    assert.strictEqual(focused, 1);
    assert.strictEqual(leases, 1);
    handlers.get("response")?.({ id: request.id, result: "confirm" });
    assert.strictEqual(await answer, "confirm");
    assert.ok(shown >= 1);
    assert.strictEqual(hidden, 1);
    assert.strictEqual(releases, 1);

    assert.strictEqual(ui.receiveRequest(JSON.stringify({ id: "remote:1", type: "context", payload: { title: "Pick", options: [{ id: "yes", title: "Yes" }] } })), true);
    const remote = pageEvents.filter((event) => event.name === "request").at(-1)?.payload as { id: string };
    handlers.get("response")?.({ id: remote.id, result: "yes" });
    assert.deepStrictEqual(parse(serverEvents.at(-1)?.payload), { id: "remote:1", result: "yes" });

    const first = ui.alert({ title: "First" });
    const second = ui.alert({ title: "Second" });
    assert.strictEqual(ui.close(), true);
    assert.strictEqual(await first, "cancel");
    assert.strictEqual(await second, "cancel");
    assert.strictEqual(ui.status().queued, 0);
    assert.strictEqual(ui.status().active, null);
});

test("client notifications remain unfocused and hide after the page reports idle", () => {
    const handlers = new Map<string, (payload?: unknown) => unknown>();
    let focused = 0;
    let hidden = 0;
    const web = {
        createView: () => 2,
        destroyView: () => true,
        showView: () => true,
        hideView: () => { hidden++; return true; },
        focusView: () => { focused++; return true; },
        emit: () => true,
        on: (_view: number, name: string, listener: (payload?: unknown) => unknown) => handlers.set(name, listener),
    };
    const ui = createUiClient({ web, events: { emitServer: () => true } });
    ui.notify("Hello");
    handlers.get("ready")?.();
    assert.strictEqual(focused, 0);
    handlers.get("idle")?.();
    assert.strictEqual(hidden, 1);
});
