export interface DatabaseConnection {
    name: string;
    slug: string;
    connector?: string;
    connecter?: string;
    options?: Record<string, unknown>;
}

export interface DatabaseConfig {
    default?: string;
    connections?: DatabaseConnection[];
    connection?: DatabaseConnection[];
}

export interface ZeruxStructureConfig {
    app?: string;
    middleware?: string | string[];
    controllers?: string | string[];
    composables?: string | string[];
    plugins?: string | string[];
    public?: string | string[];
    env?: string | string[];
}

export interface ZeruxServerConfig {
    port?: number;
    devPort?: number;
    allowedDomains?: string | string[];
    allowedDevDomain?: string;
}

export interface ZeruxDevtoolsModuleConfig {
    package: string;
    enabled?: boolean;
    options?: Record<string, unknown>;
}

export interface ZeruxDevtoolsConfig {
    modules?: Array<string | ZeruxDevtoolsModuleConfig>;
}

export interface ZeruxConfig {
    type?: "fix" | "dynamic" | "function";
    entryPoint?: string;
    outDir?: string;
    structure?: ZeruxStructureConfig;
    server?: ZeruxServerConfig;
    devtools?: ZeruxDevtoolsConfig;
    allowedDomains?: string | string[];
    allowedDevDomain?: string;
    connectorManager?: string;
    db?: DatabaseConfig;
    database?: DatabaseConfig;
    [key: string]: any;
}

export type { ZeruxPluginApi, ZeruxRequestContext } from "./bootstrap/types.js";
export { HttpError } from "./exceptions/http_error.js";
export { exceptionHandler } from "./exceptions/exception_handler.js";
export { logger, Logger } from "./bootstrap/logger.js";
