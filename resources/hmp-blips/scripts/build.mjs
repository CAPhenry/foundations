import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
await mkdir(dist, { recursive: true });
await Promise.all([
    build({ entryPoints: [path.join(root, "server/main.ts")], bundle: true, platform: "node", target: "node22", format: "cjs", outfile: path.join(dist, "server.js"), legalComments: "inline" }),
    build({ entryPoints: [path.join(root, "client/main.ts")], bundle: true, platform: "browser", target: "es2022", format: "iife", outfile: path.join(dist, "client.js"), legalComments: "inline" }),
]);
