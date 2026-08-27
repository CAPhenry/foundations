import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resourcesRoot = path.join(root, "resources");
const outputRoot = path.join(root, "build", "hmp-foundation");
const outputResources = path.join(outputRoot, "resources");
const pack = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputResources, { recursive: true });

const packaged = [];
for (const entry of await readdir(resourcesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("hmp-")) continue;
    const source = path.join(resourcesRoot, entry.name);
    const manifestPath = path.join(source, "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (!manifest.mafiahub || !manifest.name) throw new Error(`${entry.name} has no resource manifest`);

    const destination = path.join(outputResources, entry.name);
    await mkdir(destination, { recursive: true });
    const runtimeManifest = {
        name: manifest.name,
        version: manifest.version,
        author: manifest.author,
        description: manifest.description,
        license: manifest.license,
        mafiahub: manifest.mafiahub,
    };
    await writeFile(path.join(destination, "package.json"), JSON.stringify(runtimeManifest, null, 2) + "\n");
    for (const name of ["LICENSE", "README.md", "types.d.ts"]) {
        try { await cp(path.join(source, name), path.join(destination, name)); }
        catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    await cp(path.join(source, "dist"), path.join(destination, "dist"), { recursive: true });
    packaged.push({ name: manifest.name, version: manifest.version });
}

if (!packaged.length) throw new Error("No hmp-* resources were packaged");
await writeFile(path.join(outputRoot, "foundation.json"), JSON.stringify({
    name: pack.name,
    version: pack.version,
    resources: packaged,
}, null, 2) + "\n");

console.log(`Packaged ${packaged.length} resource(s) in ${path.relative(root, outputRoot)}`);
