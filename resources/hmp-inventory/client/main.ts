import type { HmpControlLease, HmpLibClient } from "../../hmp-lib/types";

const DEFAULT_VIEW_URL = "http://resources/hmp-inventory/dist/index.html";
const UI_CONTRACT = "hmp.inventory.ui/v1";
const Input = Imports.get<HmpLibClient>("hmp-lib").input;
let view = -1;
let viewUrl = DEFAULT_VIEW_URL;
let ready = false;
let visible = false;
let model: unknown = null;
let controlLease: HmpControlLease | null = null;

function lock(value: boolean): void {
    if (value && !controlLease) controlLease = Input.controls.acquire({ resource: "hmp-inventory", id: "screen" });
    else if (!value && controlLease) { controlLease.release(); controlLease = null; }
}

function ensureView(): number {
    if (view >= 0) return view;
    try { view = Web.createView(viewUrl, { visible: false }); }
    catch (_) { view = -1; }
    if (view >= 0) {
        Web.on(view, "ready", () => {
            ready = true;
            Web.emit(view, "configure", { contract: UI_CONTRACT });
            if (visible && model) Web.emit(view, "model", model);
        });
        Web.on(view, "close", () => Events.emitServer("hmp-inventory:close", "{}"));
        Web.on(view, "refresh", () => Events.emitServer("hmp-inventory:refresh", "{}"));
        Web.on(view, "use", (payload) => Events.emitServer("hmp-inventory:use", typeof payload === "string" ? payload : JSON.stringify(payload || {})));
    }
    return view;
}

function configure(payload: unknown): void {
    const value = parse(payload);
    if (!value || typeof value !== "object") return;
    const configured = value as Record<string, unknown>;
    if (configured.contract !== UI_CONTRACT) {
        console.warn(`[hmp-inventory] ignored unsupported UI contract '${String(configured.contract || "")}'`);
        return;
    }
    const nextUrl = String(configured.url || "").trim();
    if (!nextUrl || (nextUrl !== DEFAULT_VIEW_URL && !nextUrl.startsWith("http://resources/") && !nextUrl.startsWith("https://"))) return;
    if (nextUrl === viewUrl) return;
    if (view >= 0) {
        try { Web.destroyView(view); } catch (_) {}
        view = -1;
        ready = false;
    }
    viewUrl = nextUrl;
    if (visible) show(model);
}

function parse(payload: unknown): unknown {
    if (typeof payload === "string") { try { return JSON.parse(payload) as unknown; } catch (_) { return {}; } }
    return payload || {};
}

function show(payload: unknown): void {
    model = parse(payload);
    if (ensureView() < 0) { Game.notify("[inventory] The inventory screen is unavailable."); return; }
    visible = true;
    Web.showView(view);
    Web.focusView(view);
    lock(true);
    if (ready) Web.emit(view, "model", model);
}

function hide(): void {
    visible = false;
    if (view >= 0) Web.hideView(view);
    lock(false);
}

Events.on("hmp-inventory:open", show);
Events.on("hmp-inventory:configure", configure);
Events.on("hmp-inventory:model", (payload) => { model = parse(payload); if (visible && ready) Web.emit(view, "model", model); });
Events.on("hmp-inventory:close", hide);
Events.on("hmp-inventory:error", (payload: unknown) => {
    const parsed = parse(payload);
    const message = parsed && typeof parsed === "object" && "message" in parsed ? parsed.message : undefined;
    if (visible && ready && view >= 0) Web.emit(view, "actionError", parsed);
    Game.notify(`[inventory] ${String(message || "The action could not be completed.")}`);
});

try { Events.emitServer("hmp-inventory:ready", "{}"); }
catch (_) { setTimeout(() => { try { Events.emitServer("hmp-inventory:ready", "{}"); } catch (_) {} }, 1000); }
console.info("[hmp-inventory] client ready");
// TypeScript source.
