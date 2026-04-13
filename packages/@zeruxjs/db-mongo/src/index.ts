import type {
    ComparisonOperator,
    DatabaseConnector,
    DatabaseConnectorFactory,
    DatabaseExecutionContext,
    DatabaseResult,
    DeleteOperation,
    InsertOperation,
    QueryExpression,
    QueryOperation,
    SelectOperation,
    UpdateOperation,
    WhereClause,
    WherePredicate
} from "@zeruxjs/db";
import { createDatabaseError } from "@zeruxjs/db";

type MongoDbLike = {
    collection(name: string): MongoCollectionLike;
    createCollection?(name: string): Promise<unknown>;
    dropDatabase?(): Promise<boolean>;
};

type MongoCollectionLike = {
    insertOne?(doc: Record<string, unknown>): Promise<{ insertedId: unknown; }>;
    insertMany?(docs: Record<string, unknown>[]): Promise<{ insertedIds: Record<string, unknown>; }>;
    find?(query: Record<string, unknown>, options?: Record<string, unknown>): {
        toArray(): Promise<unknown[]>;
    };
    aggregate?(pipeline: unknown[]): {
        toArray(): Promise<unknown[]>;
    };
    updateMany?(query: Record<string, unknown>, update: Record<string, unknown>): Promise<{ modifiedCount: number; }>;
    deleteMany?(query: Record<string, unknown>): Promise<{ deletedCount: number; }>;
    createIndex?(keys: Record<string, 1 | -1>, options?: Record<string, unknown>): Promise<string>;
    dropIndex?(name: string): Promise<unknown>;
    drop?(): Promise<boolean>;
};

interface MongoConnectorOptions extends Record<string, unknown> {
    db?: MongoDbLike;
    client?: {
        db(name?: string): MongoDbLike;
    };
    database?: string;
    executor?: (operation: QueryOperation) => Promise<unknown> | unknown;
    fixedDatabase?: boolean;
    locked?: boolean;
    lockDatabase?: boolean;
}

const toMongoValue = (value: unknown): unknown => {
    if (
        typeof value === "object" &&
        value !== null &&
        "kind" in value &&
        typeof (value as { kind?: unknown; }).kind === "string"
    ) {
        const expression = value as Extract<QueryExpression, { kind: string; }>;
        switch (expression.kind) {
            case "column":
                return `$${expression.name}`;
            case "value":
                return expression.value;
            default:
                return value;
        }
    }

    return value;
};

const mapOperator = (operator: ComparisonOperator, value: unknown) => {
    switch (operator) {
        case "eq":
            return value;
        case "ne":
            return { $ne: value };
        case "gt":
            return { $gt: value };
        case "gte":
            return { $gte: value };
        case "lt":
            return { $lt: value };
        case "lte":
            return { $lte: value };
        case "like":
        case "ilike":
            return { $regex: String(value), ...(operator === "ilike" ? { $options: "i" } : {}) };
        case "in":
            return { $in: Array.isArray(value) ? value : [value] };
        case "notIn":
            return { $nin: Array.isArray(value) ? value : [value] };
        case "isNull":
            return null;
        case "isNotNull":
            return { $ne: null };
        default:
            return value;
    }
};

const buildWhere = (where: WhereClause): Record<string, unknown> => {
    if ("and" in where) {
        return { $and: where.and.map((entry) => buildWhere(entry)) };
    }

    if ("or" in where) {
        return { $or: where.or.map((entry) => buildWhere(entry)) };
    }

    if ("not" in where) {
        return { $nor: [buildWhere(where.not)] };
    }

    return buildPredicate(where);
};

const buildPredicate = (predicate: WherePredicate): Record<string, unknown> => {
    if (!predicate.field || typeof predicate.field !== "string") {
        throw createDatabaseError({
            code: "INVALID_WHERE",
            message: "Mongo where predicates require string field names"
        });
    }

    if (predicate.operator === "between") {
        return {
            [predicate.field]: {
                $gte: toMongoValue(predicate.from),
                $lte: toMongoValue(predicate.to)
            }
        };
    }

    if (predicate.operator === "exists" || predicate.operator === "notExists") {
        return {
            [predicate.field]: {
                $exists: predicate.operator === "exists"
            }
        };
    }

    const sourceValue = predicate.values ?? predicate.value;
    return {
        [predicate.field]: mapOperator(predicate.operator, toMongoValue(sourceValue))
    };
};

const buildProjection = (operation: SelectOperation): Record<string, unknown> | undefined => {
    if (!operation.columns || operation.columns.length === 0) {
        return undefined;
    }

    return Object.fromEntries(
        operation.columns.map((column) => {
            if (typeof column === "string") {
                return [column, 1];
            }

            if (typeof column.expr === "string") {
                return [column.as ?? column.expr, `$${column.expr}`];
            }

            return [column.as ?? "value", toMongoValue(column.expr)];
        })
    );
};

const buildSort = (operation: SelectOperation): Record<string, 1 | -1> | undefined => {
    if (!operation.orderBy || operation.orderBy.length === 0) {
        return undefined;
    }

    return Object.fromEntries(
        operation.orderBy.map((entry) => {
            if (typeof entry === "string") {
                return [entry, 1];
            }

            return [typeof entry.by === "string" ? entry.by : "value", entry.direction === "desc" ? -1 : 1];
        })
    );
};

const normalizeResult = (
    operation: QueryOperation,
    context: DatabaseExecutionContext,
    native: unknown,
    pipeline?: unknown[]
): DatabaseResult => {
    const objectResult = native as Record<string, unknown>;
    const rows = Array.isArray(native)
        ? native
        : Array.isArray(objectResult.rows)
            ? objectResult.rows
            : undefined;

    return {
        ok: true,
        connection: context.connection.slug,
        connector: context.connection.connector,
        operation: operation.op,
        rows,
        rowCount: rows?.length,
        affectedCount: typeof objectResult.modifiedCount === "number"
            ? objectResult.modifiedCount
            : typeof objectResult.deletedCount === "number"
                ? objectResult.deletedCount
                : undefined,
        insertedIds: objectResult.insertedId !== undefined
            ? [String(objectResult.insertedId)]
            : objectResult.insertedIds && typeof objectResult.insertedIds === "object"
                ? Object.values(objectResult.insertedIds as Record<string, unknown>).map((value) => String(value))
                : undefined,
        native,
        pipeline
    };
};

const getDatabase = (options: MongoConnectorOptions, databaseName?: string): MongoDbLike => {
    if (options.db) {
        return options.db;
    }

    if (options.client) {
        return options.client.db(databaseName ?? options.database);
    }

    throw createDatabaseError({
        code: "MISSING_MONGO_CLIENT",
        message: "Mongo connector requires options.db, options.client, or options.executor"
    });
};

const executeWithDb = async (
    options: MongoConnectorOptions,
    operation: QueryOperation,
    context: DatabaseExecutionContext
): Promise<DatabaseResult> => {
    const databaseName = typeof options.database === "string" ? options.database : undefined;

    if ((operation.op === "createDb" || operation.op === "dropDb") && (options.locked || options.lockDatabase)) {
        throw createDatabaseError({
            code: "DATABASE_LOCKED",
            message: `Operation "${operation.op}" is locked for connection "${context.connection.slug}"`
        });
    }

    if (operation.op === "switchDB" && (options.fixedDatabase || options.database)) {
        throw createDatabaseError({
            code: "DATABASE_FIXED",
            message: `Connection "${context.connection.slug}" uses a fixed database and cannot be switched`
        });
    }

    if (typeof options.executor === "function") {
        return normalizeResult(operation, context, await options.executor(operation));
    }

    switch (operation.op) {
        case "createDb":
            getDatabase(options, operation.name);
            return normalizeResult(operation, context, { ok: true });
        case "dropDb":
            return normalizeResult(operation, context, await getDatabase(options, operation.name).dropDatabase?.() ?? false);
        case "switchDB":
            getDatabase(options, operation.name);
            return normalizeResult(operation, context, { ok: true, database: operation.name });
        case "createTable": {
            const db = getDatabase(options, databaseName);
            await db.createCollection?.(operation.table);
            const collection = db.collection(operation.table);
            for (const index of operation.indexes ?? []) {
                await collection.createIndex?.(
                    Object.fromEntries(index.columns.map((column) => [typeof column === "string" ? column : "value", 1])),
                    {
                        unique: index.unique,
                        name: index.name
                    }
                );
            }
            return normalizeResult(operation, context, { ok: true });
        }
        case "dropTable":
            return normalizeResult(operation, context, await getDatabase(options, databaseName).collection(operation.table).drop?.() ?? false);
        case "alterTable":
            return normalizeResult(operation, context, {
                ok: true,
                warnings: ["Mongo alterTable is metadata-light and may require manual migrations"]
            });
        case "turcunateTable":
            return normalizeResult(operation, context, await getDatabase(options, databaseName).collection(operation.table).deleteMany?.({}) ?? { deletedCount: 0 });
        case "createIndex": {
            const result = await getDatabase(options, databaseName).collection(operation.table).createIndex?.(
                Object.fromEntries(operation.columns.map((column) => [typeof column === "string" ? column : "value", 1])),
                {
                    unique: operation.unique,
                    name: operation.name
                }
            );
            return normalizeResult(operation, context, { value: result });
        }
        case "dropIndex":
            return normalizeResult(operation, context, await getDatabase(options, databaseName).collection(operation.table ?? "").dropIndex?.(operation.name) ?? true);
        case "insert":
            return executeInsert(options, operation, context);
        case "select":
            return executeSelect(options, operation, context);
        case "update":
            return executeUpdate(options, operation, context);
        case "delete":
            return executeDelete(options, operation, context);
        default:
            throw createDatabaseError({
                code: "UNSUPPORTED_OPERATION",
                message: `Unsupported Mongo operation "${String((operation as QueryOperation).op)}"`
            });
    }
};

const executeInsert = async (
    options: MongoConnectorOptions,
    operation: InsertOperation,
    context: DatabaseExecutionContext
): Promise<DatabaseResult> => {
    const collection = getDatabase(options, options.database).collection(operation.table);
    if (Array.isArray(operation.values)) {
        return normalizeResult(operation, context, await collection.insertMany?.(operation.values as Record<string, unknown>[]) ?? {});
    }

    return normalizeResult(operation, context, await collection.insertOne?.(operation.values as Record<string, unknown>) ?? {});
};

const executeSelect = async (
    options: MongoConnectorOptions,
    operation: SelectOperation,
    context: DatabaseExecutionContext
): Promise<DatabaseResult> => {
    const collection = getDatabase(options, options.database).collection(operation.table);
    const pipeline: unknown[] = [];

    if (operation.where) {
        pipeline.push({ $match: buildWhere(operation.where) });
    }

    for (const join of operation.joins ?? []) {
        pipeline.push({
            $lookup: {
                from: join.table,
                as: join.as ?? join.table,
                let: {},
                pipeline: [{ $match: buildWhere(join.on) }]
            }
        });
    }

    const projection = buildProjection(operation);
    if (projection) {
        pipeline.push({ $project: projection });
    }

    if (operation.groupBy && operation.groupBy.length > 0) {
        pipeline.push({
            $group: {
                _id: Object.fromEntries(
                    operation.groupBy.map((entry) => [
                        typeof entry === "string" ? entry : "value",
                        typeof entry === "string" ? `$${entry}` : toMongoValue(entry)
                    ])
                )
            }
        });
    }

    if (operation.having) {
        pipeline.push({ $match: buildWhere(operation.having) });
    }

    const sort = buildSort(operation);
    if (sort) {
        pipeline.push({ $sort: sort });
    }

    if (typeof operation.offset === "number" && operation.offset > 0) {
        pipeline.push({ $skip: operation.offset });
    }

    const limit = operation.limit ?? operation.top ?? (
        typeof operation.fetch === "number"
            ? operation.fetch
            : operation.fetch?.count
    );
    if (typeof limit === "number") {
        pipeline.push({ $limit: limit });
    }

    for (const union of operation.union ?? []) {
        pipeline.push({
            $unionWith: {
                coll: union.table,
                pipeline: union.where ? [{ $match: buildWhere(union.where) }] : []
            }
        });
    }

    for (const union of operation.unionAll ?? []) {
        pipeline.push({
            $unionWith: {
                coll: union.table,
                pipeline: union.where ? [{ $match: buildWhere(union.where) }] : []
            }
        });
    }

    const rows = pipeline.length > 0
        ? await collection.aggregate?.(pipeline).toArray() ?? []
        : await collection.find?.(operation.where ? buildWhere(operation.where) : {}, {
            projection
        }).toArray() ?? [];

    return normalizeResult(operation, context, rows, pipeline);
};

const executeUpdate = async (
    options: MongoConnectorOptions,
    operation: UpdateOperation,
    context: DatabaseExecutionContext
): Promise<DatabaseResult> => {
    const collection = getDatabase(options, options.database).collection(operation.table);
    return normalizeResult(
        operation,
        context,
        await collection.updateMany?.(operation.where ? buildWhere(operation.where) : {}, {
            $set: operation.values
        }) ?? { modifiedCount: 0 }
    );
};

const executeDelete = async (
    options: MongoConnectorOptions,
    operation: DeleteOperation,
    context: DatabaseExecutionContext
): Promise<DatabaseResult> => {
    const collection = getDatabase(options, options.database).collection(operation.table);
    return normalizeResult(
        operation,
        context,
        await collection.deleteMany?.(operation.where ? buildWhere(operation.where) : {}) ?? { deletedCount: 0 }
    );
};

/**
 * Title: Mongo connector factory
 * Description: Creates the document-database connector that translates normalized JSON into Mongo collection operations.
 * Global Variables: none
 * @param options Connector options.
 * @returns Mongo connector instance.
 */
export const createConnector: DatabaseConnectorFactory = async (options) => {
    const normalized = options as MongoConnectorOptions;
    const connector: DatabaseConnector = {
        kind: "mongo",
        options: normalized,
        execute(operation, context) {
            return executeWithDb(normalized, operation, context);
        }
    };

    return connector;
};

export default createConnector;
