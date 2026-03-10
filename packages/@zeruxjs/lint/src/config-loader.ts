import fs from "node:fs";
import path from "node:path";

const CONFIG_FILES = [
    "lint.zerux.ts",
    "lint.zerux.js",
    "lint.zerux.json",
    ".lint.zerux.ts",
    ".lint.zerux.js",
    ".lint.zerux.json"
];

export async function loadLintConfig(root: string) {
    for (const file of CONFIG_FILES) {
        const full = path.join(root, file);

        if (!fs.existsSync(full)) continue;

        if (file.endsWith(".json")) {
            return JSON.parse(fs.readFileSync(full, "utf8"));
        }

        const mod = await import(full);
        return mod.default ?? mod;
    }

    return {};
}