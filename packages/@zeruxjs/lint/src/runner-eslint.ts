import { ESLint } from "eslint";

export async function runEslint({ fix = false }) {
    const eslint = new ESLint({
        fix
    });

    const results = await eslint.lintFiles([
        "**/*.{js,ts,jsx,tsx,vue}"
    ]);

    if (fix) {
        await ESLint.outputFixes(results);
    }

    const formatter = await eslint.loadFormatter("stylish");
    const resultText = formatter.format(results);

    console.log(resultText);
}