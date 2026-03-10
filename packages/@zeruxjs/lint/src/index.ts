import { runEslint } from "./runner-eslint.js";
import { runStylelint } from "./runner-stylelint.js";
import { runPrettier } from "./runner-prettier.js";
import { watchFiles } from "./watcher.js";

export async function lintJs({ fix = false }) {
    await runEslint({ fix });
}

export async function lintCss({ fix = false }) {
    await runStylelint({ fix });
}

export async function lintAll({ fix = false }) {
    await runPrettier({ fix });
}

export async function lint({ fix = false }) {
    await lintJs({ fix });
    await lintCss({ fix });
}

export async function watch(fn: () => Promise<void>) {
    await fn();

    watchFiles(async () => {
        await fn();
    });
}