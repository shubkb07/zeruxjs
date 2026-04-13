import fs from "node:fs";
import path from "node:path";

import { startServer } from "@zeruxjs/server";

import { loadConfig, resolveDefaultEnvFiles, resolveStructure } from "../bootstrap/config.js";
import { loadEnvironmentFiles } from "../bootstrap/env.js";
import { registerProcessExceptionHandlers } from "../bootstrap/exception.js";
import { writeRuntimeManifest } from "../bootstrap/manifest.js";
import { bootstrapApplication } from "../bootstrap/runtime.js";
import { logger } from "../bootstrap/logger.js";

const parsePort = (value: unknown) => {
    if (value === undefined || value === null || value === "") return undefined;

    const port = Number.parseInt(String(value), 10);
    return Number.isFinite(port) ? port : undefined;
};

const isInsideGeneratedDir = (filePath: string) => {
    const normalized = filePath.replace(/\\/g, "/");
    return normalized === ".zerux" || normalized.startsWith(".zerux/") || normalized.includes("/.zerux/");
};

const getProjectName = (rootDir: string) => {
    const packageJsonPath = path.join(rootDir, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
        return path.basename(rootDir);
    }

    try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
        return packageJson.name || path.basename(rootDir);
    } catch {
        return path.basename(rootDir);
    }
};

const writeDevSnapshot = (details: {
    rootDir: string;
    appName: string;
    mode: "dev" | "start";
    manifestPath: string;
    loadedEnvFiles: string[];
    routes: Array<{ path: string; methods: string[] }>;
    appPort?: number;
    devtoolsModules?: unknown[];
}) => {
    const outputDir = path.join(details.rootDir, ".zerux");
    const snapshotPath = path.join(outputDir, "dev.json");
    const previous = fs.existsSync(snapshotPath)
        ? JSON.parse(fs.readFileSync(snapshotPath, "utf8"))
        : {};

    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(
        snapshotPath,
        JSON.stringify(
            {
                ...previous,
                appName: details.appName,
                mode: details.mode,
                rootDir: details.rootDir,
                manifestPath: details.manifestPath,
                logFilePath: logger.getFilePath(),
                loadedEnvFiles: details.loadedEnvFiles,
                routes: details.routes,
                appPort: details.appPort,
                devtools: {
                    modules: Array.isArray(details.devtoolsModules) ? details.devtoolsModules : []
                },
                updatedAt: new Date().toISOString()
            },
            null,
            2
        ),
        "utf8"
    );

    return snapshotPath;
};

export const server = async (
    mode: "dev" | "start" = "start",
    args: { namedArgs?: Record<string, string | boolean | string[]>; positionalArgs?: string[] }
) => {
    const rootDir = process.cwd();
    loadEnvironmentFiles(resolveDefaultEnvFiles(rootDir, mode));
    const config = await loadConfig(rootDir, mode);
    const structure = resolveStructure(rootDir, config);

    const loadedEnvFiles = loadEnvironmentFiles(structure.envFiles);
    registerProcessExceptionHandlers(logger);

    let bootstrap = await bootstrapApplication(rootDir, mode, config, structure);
    let manifestPath = writeRuntimeManifest(bootstrap.runtime);
    let devDataPath = writeDevSnapshot({
        rootDir,
        appName: getProjectName(rootDir),
        mode,
        manifestPath,
        loadedEnvFiles,
        routes: bootstrap.runtime.routes.map((route) => ({
            path: route.pattern,
            methods: Object.keys(route.methods).sort()
        })),
        appPort: parsePort(args.namedArgs?.p ?? args.namedArgs?.port ?? config.server?.port),
        devtoolsModules: config.devtools?.modules
    });
    const appName = getProjectName(rootDir);
    const appPort = parsePort(args.namedArgs?.p ?? args.namedArgs?.port ?? config.server?.port);
    const devPort = parsePort(args.namedArgs?.devPort ?? config.server?.devPort);
    let currentHandler = bootstrap.runtime.createHandler();
    const appHandler = async (req: any, res: any) => currentHandler(req, res);

    logger.info("Zerux bootstrap ready", {
        mode,
        appName,
        manifestPath,
        loadedEnvFiles,
        routes: bootstrap.runtime.routes.length
    });

    await startServer({
        service: "zerux",
        config,
        app: {
            name: appName,
            port: appPort,
            func: appHandler
        },
        dev: mode === "dev" ? {
            port: devPort,
            dataFilePath: devDataPath,
            logFilePath: logger.getFilePath(),
            runtimeManifestPath: manifestPath,
            watchTriggerFunc: (event: { file?: string, type?: string }) => {
                const file = event.file ?? "";
                if (event.type === "resave") return false;
                if (!file) return false;
                if (file.includes("node_modules")) return false;
                if (isInsideGeneratedDir(file)) return false;
                if (file.endsWith(".log")) return false;
                return true;
            },
            watchFunc: async () => {
                loadEnvironmentFiles(resolveDefaultEnvFiles(rootDir, mode));
                const nextConfig = await loadConfig(rootDir, mode);
                const nextStructure = resolveStructure(rootDir, nextConfig);
                loadEnvironmentFiles(nextStructure.envFiles);

                bootstrap = await bootstrapApplication(rootDir, mode, nextConfig, nextStructure);
                manifestPath = writeRuntimeManifest(bootstrap.runtime);
                devDataPath = writeDevSnapshot({
                    rootDir,
                    appName,
                    mode,
                    manifestPath,
                    loadedEnvFiles: nextStructure.envFiles,
                    routes: bootstrap.runtime.routes.map((route) => ({
                        path: route.pattern,
                        methods: Object.keys(route.methods).sort()
                    })),
                    appPort,
                    devtoolsModules: nextConfig.devtools?.modules
                });
                currentHandler = bootstrap.runtime.createHandler();
            }
        } : undefined
    });

    return new Promise(() => undefined);
};
