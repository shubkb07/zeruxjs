import fs from "node:fs";
import path from "node:path";

import { startServer } from "zsrv";

import { loadConfig, resolveDefaultEnvFiles, resolveStructure } from "../bootstrap/config.js";
import { loadEnvironmentFiles } from "../bootstrap/env.js";
import { registerProcessExceptionHandlers } from "../bootstrap/exception.js";
import { writeRuntimeManifest } from "../bootstrap/manifest.js";
import { bootstrapApplication } from "../bootstrap/runtime.js";
import { logger } from "../bootstrap/logger.js";
import { runWorkers } from "../bootstrap/worker.js";
import type { ZeruxWorkerRunResult } from "../bootstrap/worker.js";

const parsePort = (value: unknown) => {
    if (value === undefined || value === null || value === "") return undefined;

    const port = Number.parseInt(String(value), 10);
    return Number.isFinite(port) ? port : undefined;
};

const isInsideGeneratedDir = (filePath: string, serviceName: string) => {
    const normalized = filePath.replace(/\\/g, "/");
    const dir = `.${serviceName}`;
    return normalized === dir || normalized.startsWith(`${dir}/`) || normalized.includes(`/${dir}/`);
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
    workers: string[];
    threadWorkers: string[];
    appPort?: number;
    devtoolsModules?: unknown[];
    serviceName: string;
}) => {
    const outputDir = path.join(details.rootDir, `.${details.serviceName}`);
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
                workers: details.workers,
                threadWorkers: details.threadWorkers,
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
    args: { namedArgs?: Record<string, string | boolean | string[]>; positionalArgs?: string[]; serviceName?: string }
) => {
    const serviceName = args.serviceName ?? "zerux";
    const rootDir = process.cwd();
    loadEnvironmentFiles(resolveDefaultEnvFiles(rootDir, mode));
    const config = await loadConfig(rootDir, mode);
    const structure = resolveStructure(rootDir, config, serviceName);

    // Relocate logger to the service directory
    logger.relocate(structure.outputDir);

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
        workers: [...bootstrap.runtime.workers.keys()].sort(),
        threadWorkers: [...bootstrap.runtime.threadWorkers.keys()].sort(),
        appPort: parsePort(args.namedArgs?.p ?? args.namedArgs?.port ?? config.server?.port),
        devtoolsModules: config.devtools?.modules,
        serviceName
    });
    const appName = getProjectName(rootDir);
    const appPort = parsePort(args.namedArgs?.p ?? args.namedArgs?.port ?? config.server?.port);
    const devPort = parsePort(args.namedArgs?.devPort ?? config.server?.devPort);
    let currentHandler = bootstrap.runtime.createHandler();
    let workerRun: ZeruxWorkerRunResult | null = await runWorkers(bootstrap.runtime);
    const appHandler = async (req: any, res: any) => currentHandler(req, res);

    logger.info("Zerux bootstrap ready", {
        mode,
        appName,
        manifestPath,
        loadedEnvFiles,
        routes: bootstrap.runtime.routes.length,
        workers: bootstrap.runtime.workers.size,
        threadWorkers: bootstrap.runtime.threadWorkers.size
    });

    await startServer({
        service: serviceName,
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
                if (isInsideGeneratedDir(file, serviceName)) return false;
                if (file.endsWith(".log")) return false;
                return true;
            },
            watchFunc: async () => {
                await workerRun?.stop();
                workerRun = null;

                loadEnvironmentFiles(resolveDefaultEnvFiles(rootDir, mode));
                const nextConfig = await loadConfig(rootDir, mode);
                const nextStructure = resolveStructure(rootDir, nextConfig, serviceName);
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
                    workers: [...bootstrap.runtime.workers.keys()].sort(),
                    threadWorkers: [...bootstrap.runtime.threadWorkers.keys()].sort(),
                    appPort,
                    devtoolsModules: nextConfig.devtools?.modules,
                    serviceName
                });
                currentHandler = bootstrap.runtime.createHandler();
                workerRun = await runWorkers(bootstrap.runtime);
            }
        } : undefined
    });

    return new Promise(() => undefined);
};
