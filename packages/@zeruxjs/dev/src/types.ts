import type http from "node:http";

export interface SharedDevRegistrationOptions {
    appName: string;
    appPort: number;
    rootDir: string;
    preferredPort?: number;
    dataFilePath?: string;
    logFilePath?: string;
    runtimeManifestPath?: string;
}

export interface SharedDevRegistration {
    appName: string;
    routeName: string;
    appPort: number;
    rootDir: string;
    dataFilePath: string | null;
    logFilePath: string | null;
    runtimeManifestPath: string | null;
    startedAt: string;
    updatedAt: string;
}

export interface SharedDevRegistry {
    port?: number;
    serverPid?: number;
    updatedAt?: string;
    apps: SharedDevRegistration[];
}

export interface SharedDevStartResult {
    port: number;
    routeName: string;
    urls: {
        devtools: string;
        websocket: string;
    };
}

export interface SharedDevEvent {
    app: string;
    type: string;
    payload?: Record<string, unknown>;
    timestamp?: string;
}

export interface SharedDevServerHandle {
    port: number;
    server: http.Server;
}

export interface SharedDevSnapshot {
    routeName: string;
    appName: string;
    rootDir: string;
    appPort: number;
    manifestPath: string | null;
    logFilePath: string | null;
    startedAt: string;
    updatedAt: string;
    mode: string;
    routes: Array<{ path: string; methods: string[] }>;
    devtools: {
        modules: Array<string | { package: string; enabled?: boolean; options?: Record<string, unknown> }>;
    };
    clientEvents: Record<string, unknown>[];
    logs: string[];
}
