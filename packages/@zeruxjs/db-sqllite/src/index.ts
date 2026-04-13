import type { DatabaseConnectorFactory } from "@zeruxjs/db";
import { createSqlConnector } from "../../db-sql-core/dist/index.js";

type BetterSqliteStatement = {
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): {
        changes: number;
        lastInsertRowid?: number;
    };
};

type BetterSqliteDatabase = {
    prepare(statement: string): BetterSqliteStatement;
    exec(statement: string): void;
};

const createBetterSqliteExecutor = (filename: string) => {
    const BetterSqlite = require("better-sqlite3") as new (file: string) => BetterSqliteDatabase;
    const database = new BetterSqlite(filename);

    return {
        executor: (statement: string, params: unknown[]) => {
            const normalized = statement.trim().toUpperCase();
            if (normalized.startsWith("CREATE DATABASE") || normalized.startsWith("DROP DATABASE") || normalized.startsWith("USE ")) {
                return {
                    changes: 0
                };
            }

            if (normalized.startsWith("CREATE ") || normalized.startsWith("DROP ") || normalized.startsWith("ALTER ") || normalized.startsWith("TRUNCATE ")) {
                database.exec(statement);
                return {
                    changes: 0
                };
            }

            const prepared = database.prepare(statement);
            if (normalized.startsWith("SELECT")) {
                return prepared.all(...params);
            }

            return prepared.run(...params);
        }
    };
};

/**
 * Title: SQLite connector factory
 * Description: Creates the SQLite JSON connector and auto-wires better-sqlite3 when a filename is provided.
 * Global Variables: none
 * @param options Connector options.
 * @returns SQLite connector instance.
 */
export const createConnector: DatabaseConnectorFactory = async (options) => {
    const sqliteOptions = typeof options.filename === "string" && !options.executor && !options.client && !options.pool
        ? {
            ...options,
            ...createBetterSqliteExecutor(options.filename)
        }
        : options;

    return createSqlConnector(
        {
            kind: "sqlite",
            quoteIdentifier: (identifier: string) => `"${identifier.replace(/"/g, "\"\"")}"`,
            placeholder: () => "?",
            functions: {
                LEN: "LENGTH",
                NOW: "CURRENT_TIMESTAMP",
                CURRENT_TIMESTAMP: "CURRENT_TIMESTAMP",
                CURRENT_DATE: "CURRENT_DATE",
                DATE_DIFF: "JULIANDAY"
            },
            supportsReturning: true,
            supportsIfNotExistsIndex: true,
            autoIncrementKeyword: "AUTOINCREMENT"
        },
        sqliteOptions
    );
};

export default createConnector;
