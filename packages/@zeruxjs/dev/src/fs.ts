import fs from "node:fs";
import path from "node:path";

export const ensureParentDirectory = (filePath: string) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
};

export const readJsonFile = <T>(filePath: string, fallback: T): T => {
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
    } catch {
        return fallback;
    }
};

export const writeJsonFile = (filePath: string, value: unknown) => {
    ensureParentDirectory(filePath);
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
};
