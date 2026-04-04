import { defineConfig } from "tsup";

export default defineConfig([
    // Normal build
    {
        entry: ["src/index.ts"],
        format: ["esm"],
        dts: true,
        sourcemap: true,
        clean: true,
        minify: false,
        target: "es2022",
        splitting: false,
        bundle: true,
        outDir: "dist",
        outExtension: () => ({ js: ".js" }),
    },

    // Minified build
    {
        entry: ["src/index.ts"],
        format: ["esm"],
        dts: false, // avoid duplicate d.ts
        sourcemap: true,
        clean: false, // don't delete previous build
        minify: true,
        target: "es2022",
        splitting: false,
        bundle: true,
        outDir: "dist",
        outExtension: () => ({ js: ".min.js" }),
    },
]);