import prettier from "prettier";
import fs from "node:fs";
import path from "node:path";

export async function runPrettier({ fix = false }) {
    const files = ["**/*.{js,ts,jsx,tsx,json,yml,html,css,scss}"];

    for (const file of files) {
        const text = fs.readFileSync(file, "utf8");

        const formatted = await prettier.format(text, {
            filepath: file
        });

        if (fix) {
            fs.writeFileSync(file, formatted);
        }
    }
}