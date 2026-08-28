import type { HmpEmoteChannel, HmpEmoteDefinition } from "../types";

const NAME = /^[a-z0-9_-]{1,24}$/;
const RESOURCE = /^[a-z0-9][a-z0-9_.-]{0,63}$/;

function nameOf(value: unknown): string {
    const name = String(value || "").trim().toLowerCase();
    if (!NAME.test(name)) throw new TypeError("emote name must contain 1-24 lowercase letters, numbers, underscores, or hyphens");
    return name;
}

function pathOf(value: unknown): string {
    const path = String(value || "").trim();
    if (!path || path.length > 256 || !path.startsWith("/Game/") || !path.includes(".")) {
        throw new TypeError("emote path must be a /Game/ object path up to 256 characters");
    }
    return path;
}

function channelOf(value: unknown): HmpEmoteChannel {
    if (value === undefined || value === "" || value === "FullBody") return "FullBody";
    if (value === "PartialBody") return "PartialBody";
    throw new TypeError("emote channel must be FullBody or PartialBody");
}

function normalizeDefinition(raw: unknown, fallbackResource?: string): HmpEmoteDefinition {
    if (typeof raw === "string") return { name: "", path: pathOf(raw), kind: "pose", channel: "FullBody" };
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("emote definition must be an object");
    const value = raw as Record<string, unknown>;
    const resource = String(value.resource || fallbackResource || "").trim().toLowerCase();
    if (resource && !RESOURCE.test(resource)) throw new TypeError("emote resource owner is invalid");
    return {
        name: nameOf(value.name),
        path: pathOf(value.path),
        kind: value.kind === "ability" ? "ability" : "pose",
        channel: channelOf(value.channel),
        ...(resource ? { resource } : {}),
    };
}

function normalizeConfigured(name: string, raw: unknown): HmpEmoteDefinition {
    const value = typeof raw === "string" ? { path: raw } : raw;
    return normalizeDefinition({ ...(value as Record<string, unknown>), name });
}

export = { NAME, nameOf, pathOf, channelOf, normalizeDefinition, normalizeConfigured };
