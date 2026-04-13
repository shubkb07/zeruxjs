import type { DatabaseConnectorFactory } from "@zeruxjs/db";
import { createSqlConnector } from "../../db-sql-core/dist/index.js";

type MySqlExecutorResult = unknown;

type MySqlPoolLike = {
    execute(statement: string, params?: unknown[]): Promise<[MySqlExecutorResult, unknown]>;
    end?(): Promise<void>;
};

interface MySqlConnectorOptions extends Record<string, unknown> {
    client?: {
        query?: (statement: string, params?: unknown[]) => Promise<unknown>;
        execute?: (statement: string, params?: unknown[]) => Promise<unknown>;
    };
    pool?: MySqlPoolLike;
    host?: string;
    hostname?: string;
    username?: string;
    user?: string;
    password?: string;
    database?: string;
    port?: number;
    connectionLimit?: number;
    waitForConnections?: boolean;
    ssl?: unknown;
    executor?: (statement: string, params: unknown[]) => Promise<unknown> | unknown;
}

/**
 * Title: MySQL pool creator
 * Description: Creates a mysql2 pool when only connection credentials are supplied in config.
 * Global Variables: none
 * @param options Connector options.
 * @returns Pool plus ownership flag.
 */
const createManagedPool = async (
    options: MySqlConnectorOptions
): Promise<{ pool: MySqlPoolLike; owned: boolean; }> => {
    if (options.pool) {
        return { pool: options.pool, owned: false };
    }

    if (options.client || options.executor) {
        return {
            pool: {
                execute: async (statement, params) => {
                    if (typeof options.executor === "function") {
                        return [await options.executor(statement, params ?? []), undefined];
                    }

                    const result = await options.client!.execute!(statement, params);
                    return [result, undefined];
                }
            },
            owned: false
        };
    }

    const loadMySqlModule = new Function(
        "return import('mysql2/promise')"
    ) as () => Promise<{ createPool(config: Record<string, unknown>): MySqlPoolLike; }>;
    const mysqlModule = await loadMySqlModule();
    const pool = mysqlModule.createPool({
        host: typeof options.host === "string" ? options.host : options.hostname,
        user: typeof options.user === "string" ? options.user : options.username,
        password: options.password,
        database: typeof options.database === "string" ? options.database : undefined,
        port: typeof options.port === "number" ? options.port : 3306,
        connectionLimit: typeof options.connectionLimit === "number" ? options.connectionLimit : 10,
        waitForConnections: typeof options.waitForConnections === "boolean" ? options.waitForConnections : true,
        ssl: options.ssl
    });

    return { pool, owned: true };
};

/**
 * Title: MySQL connector factory
 * Description: Creates the MySQL JSON connector with dialect-specific quoting and function mapping.
 * Global Variables: none
 * @param options Connector options.
 * @returns MySQL connector instance.
 */
export const createConnector: DatabaseConnectorFactory = async (options) => {
    const mysqlOptions = options as MySqlConnectorOptions;
    const { pool, owned } = await createManagedPool(mysqlOptions);
    const connector = createSqlConnector(
        {
            kind: "mysql",
            quoteIdentifier: (identifier: string) => `\`${identifier.replace(/`/g, "``")}\``,
            placeholder: () => "?",
            functions: {
                LEN: "CHAR_LENGTH",
                NOW: "NOW",
                CURRENT_TIMESTAMP: "CURRENT_TIMESTAMP",
                CURRENT_DATE: "CURRENT_DATE",
                DATE_DIFF: "DATEDIFF"
            },
            supportsReturning: false,
            supportsIfNotExistsIndex: false,
            autoIncrementKeyword: "AUTO_INCREMENT"
        },
        {
            ...mysqlOptions,
            pool: {
                execute: async (statement, params) => {
                    const [result] = await pool.execute(statement, params);
                    return result;
                }
            }
        }
    );
    return {
        ...connector,
        async disconnect() {
            await connector.disconnect?.();
            if (owned && typeof pool.end === "function") {
                await pool.end();
            }
        },
        getNativeConnection() {
            return pool;
        }
    };
};

export default createConnector;
