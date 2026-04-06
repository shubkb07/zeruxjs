import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";

import { buildContentSecurityPolicy } from "@zeruxjs/security";

import { createDocumentSecurity } from "./components/document.js";
import { readModuleAsset, resolveModuleApiRequest, resolveModuleSocketRequest } from "./module-loader.js";
import { readDevAsset, renderApplicationPage, renderHomePage, resolveCustomApiHandler, loadApplicationSections } from "./render.js";
import { appendSnapshotEvent, normalizeSnapshot } from "./state.js";
import { getRegistryApp, readRegistry, readSharedDevRouteName, registerSharedDevApp, unregisterSharedDevApp, isPortFree, findPort, writeRegistry } from "./registry.js";
import type { SharedDevEvent, SharedDevServerHandle } from "./types.js";

let sharedServerHandle: SharedDevServerHandle | null = null;
let sharedDevEventBroadcaster: ((appName: string, event: SharedDevEvent) => void) | null = null;

const sendJson = (res: ServerResponse, body: unknown, statusCode = 200) => {
    res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
};

const sendHtml = (
    res: ServerResponse,
    body: string,
    statusCode = 200,
    headers: Record<string, string> = {}
) => {
    res.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8", ...headers });
    res.end(body);
};

const sendBuffer = (res: ServerResponse, body: Buffer, contentType: string, statusCode = 200) => {
    res.writeHead(statusCode, { "Content-Type": contentType });
    res.end(body);
};

const normalizeAncestorOrigin = (value?: string | null) => {
    if (!value) return null;
    try {
        const origin = new URL(value).origin;
        if (origin.startsWith("http://") || origin.startsWith("https://")) {
            return origin;
        }
    } catch {
        return null;
    }
    return null;
};

const getFrameAncestors = (req?: IncomingMessage, appPort?: number) => {
    const ancestors = new Set<string>(["'self'"]);
    if (appPort) {
        ancestors.add(`http://127.0.0.1:${appPort}`);
        ancestors.add(`http://localhost:${appPort}`);
        ancestors.add(`https://127.0.0.1:${appPort}`);
        ancestors.add(`https://localhost:${appPort}`);
    }
    const requestOrigin = normalizeAncestorOrigin(String(req?.headers.origin || ""));
    const refererOrigin = normalizeAncestorOrigin(String(req?.headers.referer || ""));
    if (requestOrigin) ancestors.add(requestOrigin);
    if (refererOrigin) ancestors.add(refererOrigin);
    ancestors.add("https://*.localhost");
    return [...ancestors];
};

const buildFrameAwarePolicy = (nonce: string, req?: IncomingMessage, appPort?: number) =>
    buildContentSecurityPolicy(nonce).replace(
        "frame-ancestors 'self'",
        `frame-ancestors ${getFrameAncestors(req, appPort).join(" ")}`
    );

const readRequestBody = async (req: IncomingMessage) =>
    new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
    });

const toJsonBody = (body: Buffer) => {
    try {
        return JSON.parse(body.toString("utf8") || "{}") as Record<string, unknown>;
    } catch {
        return {};
    }
};

const getAppFromPath = (pathname: string) => {
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length === 0) return null;

    const app = getRegistryApp(segments[0]);
    if (!app) return null;

    return {
        app,
        remainingPath: `/${segments.slice(1).join("/")}`.replace(/\/+$/, "") || "/"
    };
};

const broadcastEvent = (appName: string, event: SharedDevEvent) => {
    sharedDevEventBroadcaster?.(appName, {
        ...event,
        timestamp: event.timestamp ?? new Date().toISOString()
    });
};

const handleHttpRequest = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const pathname = url.pathname;

    if (pathname === "/__zerux/assets/style.css") {
        const asset = readDevAsset("style.css");
        if (!asset) {
            sendJson(res, { message: "Asset not found" }, 404);
            return;
        }
        sendBuffer(res, asset, "text/css; charset=utf-8");
        return;
    }

    if (pathname === "/__zerux/assets/app.js") {
        const asset = readDevAsset("app.js");
        if (!asset) {
            sendJson(res, { message: "Asset not found" }, 404);
            return;
        }
        sendBuffer(res, asset, "text/javascript; charset=utf-8");
        return;
    }

    if (pathname === "/") {
        const security = createDocumentSecurity();
        const page = await renderHomePage(readRegistry().apps);
        sendHtml(res, page(security.nonce), 200, {
            "Content-Security-Policy": buildFrameAwarePolicy(security.nonce, req)
        });
        return;
    }

    if (pathname === "/__zerux/events" && req.method === "POST") {
        const body = toJsonBody(await readRequestBody(req));
        if (typeof body.app !== "string" || typeof body.type !== "string") {
            sendJson(res, { message: "Missing app name" }, 400);
            return;
        }

        broadcastEvent(body.app, body as unknown as SharedDevEvent);
        sendJson(res, { ok: true });
        return;
    }

    const resolved = getAppFromPath(pathname);
    if (!resolved) {
        sendJson(res, { message: "Application not found" }, 404);
        return;
    }

    const { app, remainingPath } = resolved;
    const identifier = url.searchParams.get("identifier");
    const snapshot = normalizeSnapshot(app, { identifier });

    if (remainingPath === "/__zerux/state" && req.method === "GET") {
        sendJson(res, snapshot);
        return;
    }

    if (remainingPath === "/__zerux/api/bootstrap" && req.method === "GET") {
        const { sections, modules } = await loadApplicationSections(app, snapshot, identifier);
        sendJson(res, {
            app,
            identifier,
            modules: modules.map((module) => ({
                id: module.id,
                title: module.title,
                description: module.description,
                badge: module.badge,
                packageName: module.packageName,
                dependencies: module.dependencies,
                assets: module.assets,
                sections: (module.sections ?? []).map((section) => ({
                    id: section.id,
                    title: section.title,
                    icon: section.icon,
                    order: section.order,
                    moduleId: section.moduleId
                })),
                meta: module.meta
            })),
            sections: sections.map(({ id, title, icon }) => ({ id, title, icon })),
            snapshot
        });
        return;
    }

    const moduleAssetMatch = remainingPath.match(/^\/__zerux\/modules\/([^/]+)\/(style\.css|client\.js)$/);
    if (moduleAssetMatch && req.method === "GET") {
        const [, moduleId, assetName] = moduleAssetMatch;
        const asset = await readModuleAsset(
            app,
            snapshot,
            moduleId,
            assetName === "style.css" ? "style" : "script"
        );
        if (!asset) {
            sendJson(res, { message: "Module asset not found" }, 404);
            return;
        }

        sendBuffer(
            res,
            asset,
            assetName === "style.css" ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8"
        );
        return;
    }

    const moduleApiMatch = remainingPath.match(/^\/__zerux\/modules\/([^/]+)\/api\/([^/]+)$/);
    if (moduleApiMatch) {
        const [, moduleId, handlerName] = moduleApiMatch;
        const requestBody = req.method === "GET" || req.method === "HEAD"
            ? {}
            : toJsonBody(await readRequestBody(req));
        const requesterModuleId = url.searchParams.get("requester");
        const result = await resolveModuleApiRequest({
            app,
            snapshot,
            moduleId,
            handlerName,
            request: req,
            body: requestBody,
            identifier,
            requesterModuleId
        });

        if (result === null) {
            sendJson(res, { message: "Module API handler not found" }, 404);
            return;
        }

        sendJson(res, result);
        return;
    }

    if (remainingPath.startsWith("/__zerux/api/")) {
        const apiName = remainingPath.slice("/__zerux/api/".length);
        const handler = resolveCustomApiHandler(apiName);
        if (!handler) {
            sendJson(res, { message: "API handler not found" }, 404);
            return;
        }
        sendJson(res, await handler({ req, app, snapshot, identifier }));
        return;
    }

    if (remainingPath === "/__zerux/client-event" && req.method === "POST") {
        const payload = toJsonBody(await readRequestBody(req));
        appendSnapshotEvent(app.dataFilePath, payload);
        broadcastEvent(app.routeName, {
            app: app.routeName,
            type: "client-event",
            payload
        });
        sendJson(res, { ok: true });
        return;
    }

    if (remainingPath === "/" && req.method === "GET") {
        const security = createDocumentSecurity();
        const page = await renderApplicationPage(app, snapshot, identifier);
        sendHtml(res, page(security.nonce), 200, {
            "Content-Security-Policy": buildFrameAwarePolicy(security.nonce, req, app.appPort)
        });
        return;
    }

    sendJson(res, { message: "Route not found" }, 404);
};

export const ensureSharedDevServer = async (preferredPort?: number) => {
    if (sharedServerHandle) {
        return sharedServerHandle;
    }

    const registry = readRegistry();
    const port = registry.port ?? await findPort(preferredPort ?? 9000);
    const portFree = await isPortFree(port);
    const liveOwner = registry.serverPid ? (() => {
        try {
            process.kill(registry.serverPid, 0);
            return true;
        } catch {
            return false;
        }
    })() : false;

    if (!portFree && liveOwner && registry.serverPid !== process.pid) {
        return null;
    }

    const server = http.createServer((req, res) => {
        void handleHttpRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => resolve());
    });

    writeRegistry({
        ...registry,
        port,
        serverPid: process.pid
    });

    sharedServerHandle = { port, server };
    server.on("close", () => {
        const currentRegistry = readRegistry();
        if (currentRegistry.serverPid === process.pid) {
            writeRegistry({
                ...currentRegistry,
                serverPid: undefined
            });
        }
        sharedServerHandle = null;
    });

    return sharedServerHandle;
};

export const closeSharedDevServer = async () => {
    if (!sharedServerHandle) return;

    const current = sharedServerHandle;
    sharedServerHandle = null;
    await new Promise<void>((resolve) => current.server.close(() => resolve()));
};

export const publishSharedDevEvent = async (port: number, event: SharedDevEvent) => {
    const payload = JSON.stringify({
        ...event,
        timestamp: event.timestamp ?? new Date().toISOString()
    });

    await new Promise<void>((resolve) => {
        const request = http.request(
            {
                hostname: "127.0.0.1",
                port,
                path: "/__zerux/events",
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(payload, "utf8")
                }
            },
            (response) => {
                response.resume();
                response.on("end", () => resolve());
            }
        );

        request.on("error", () => resolve());
        request.write(payload);
        request.end();
    });
};

export const setSharedDevEventBroadcaster = (
    broadcaster: ((appName: string, event: SharedDevEvent) => void) | null
) => {
    sharedDevEventBroadcaster = broadcaster;
};

export const resolveSharedDevModuleSocketRequest = async (options: {
    appName: string;
    moduleId: string;
    channel: string;
    payload?: Record<string, unknown>;
    identifier?: string | null;
    clientType?: string;
    requesterModuleId?: string | null;
}) => {
    const app = getRegistryApp(options.appName);
    if (!app) {
        return null;
    }

    const snapshot = normalizeSnapshot(app, { identifier: options.identifier });
    return resolveModuleSocketRequest({
        app,
        snapshot,
        moduleId: options.moduleId,
        channel: options.channel,
        payload: options.payload,
        identifier: options.identifier,
        clientType: options.clientType,
        requesterModuleId: options.requesterModuleId
    });
};

export {
    getRegistryApp,
    readSharedDevRouteName,
    registerSharedDevApp,
    unregisterSharedDevApp
};
