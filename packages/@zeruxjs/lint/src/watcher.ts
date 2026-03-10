import fs from "node:fs";

export function watchFiles(callback: () => void) {
    fs.watch(process.cwd(), { recursive: true }, () => {
        callback();
    });
}