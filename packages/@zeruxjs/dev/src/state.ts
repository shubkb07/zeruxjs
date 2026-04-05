import fs from "node:fs";

import { CLIENT_EVENT_LIMIT, LOG_LINE_LIMIT } from "./constants.js";
import { readJsonFile, writeJsonFile } from "./fs.js";
import type { SharedDevRegistration, SharedDevSnapshot } from "./types.js";

export const readTailLines = (filePath: string | null, limit = LOG_LINE_LIMIT) => {
    if (!filePath || !fs.existsSync(filePath)) return [];

    const content = fs.readFileSync(filePath, "utf8");
    return content
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(-limit);
};

export const appendSnapshotEvent = (filePath: string | null, event: Record<string, unknown>) => {
    if (!filePath) return;

    const snapshot = readJsonFile<Record<string, unknown>>(filePath, {});
    const currentEvents = Array.isArray(snapshot.clientEvents) ? snapshot.clientEvents : [];
    snapshot.clientEvents = [...currentEvents, event].slice(-CLIENT_EVENT_LIMIT);
    snapshot.updatedAt = new Date().toISOString();
    writeJsonFile(filePath, snapshot);
};

export const normalizeSnapshot = (
    app: SharedDevRegistration,
    options?: { identifier?: string | null }
): SharedDevSnapshot => {
    const snapshot = app.dataFilePath
        ? readJsonFile<Record<string, unknown>>(app.dataFilePath, {})
        : {};
    const rawEvents = Array.isArray(snapshot.clientEvents)
        ? snapshot.clientEvents as Record<string, unknown>[]
        : [];
    const clientEvents = options?.identifier
        ? rawEvents.filter((event) => event.identifier === options.identifier)
        : rawEvents;

    return {
        routeName: app.routeName,
        appName: app.appName,
        rootDir: app.rootDir,
        appPort: app.appPort,
        manifestPath: app.runtimeManifestPath,
        logFilePath: app.logFilePath,
        startedAt: app.startedAt,
        updatedAt: String(snapshot.updatedAt ?? app.updatedAt),
        mode: String(snapshot.mode ?? "dev"),
        routes: Array.isArray(snapshot.routes)
            ? snapshot.routes as Array<{ path: string; methods: string[] }>
            : [],
        devtools: {
            modules: Array.isArray((snapshot as { devtools?: { modules?: unknown[] } }).devtools?.modules)
                ? (snapshot as { devtools?: { modules?: Array<string | { package: string; enabled?: boolean; options?: Record<string, unknown> }> } }).devtools!.modules!
                : []
        },
        clientEvents,
        logs: readTailLines(app.logFilePath)
    };
};
