import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await mkdir(path.join(root, "dist"), { recursive: true });
await cp(path.join(root, "client", "index.html"), path.join(root, "dist", "index.html"));
await cp(path.join(root, "client", "fonts"), path.join(root, "dist", "fonts"), { recursive: true });
