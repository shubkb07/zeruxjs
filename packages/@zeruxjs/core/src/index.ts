/**
 * Configuration for a specific database connection within the Zerux application.
 */
export interface DatabaseConnection {
    /**
     * The human-readable name of the database connection.
     * @example "Authentication Database"
     */
    name: string;
    /**
     * A unique string identifier used to reference this database connection internally.
     * @example "auth_db"
     */
    slug: string;
    /**
     * The node module package or internal provider driver responsible for handling the connection.
     * @example "@zeruxjs/mongo"
     */
    connecter: string;
    /**
     * Additional provider-specific configuration options, credentials, and settings passed to the connector.
     */
    options?: Record<string, string | number | boolean>;
}

/**
 * Global configuration interface for a ZeruxJS Application.
 * This is used to strongly type the zerux.config.ts / zerux.config.js files.
 */
export interface ZeruxConfig {
    /**
     * Target application type determining execution behaviors (e.g. "fix", "dynamic", "function").
     * @type {string}
     * @default "fix"
     */
    type?: 'fix' | 'dynamic' | 'function';
    /**
     * Configuration for database adapters and persistent storage connections.
     * @type {object} | void
     */
    database?: {
        /**
         * The slug label of the default connection to be used if multiple connections are provided.
         */
        default?: string;
        /**
         * An array of database connection profiles that the application can securely connect to.
         */
        connections?: DatabaseConnection[];
    };
    /**
     * Catch-all handler permitting future attributes and custom configurations undocumented in the base interface.
     */
    [key: string]: any;
}