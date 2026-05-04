/**
 * SQL Server client wrapper using the `mssql` package.
 * All queries run through this client use a read-only connection pool.
 * Credentials come from the org's scoped env — never from process.env.
 */

import sql from 'mssql';
import pino from 'pino';

export interface SqlClientConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
  queryTimeoutSeconds: number;
  maxRows: number;
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  columns: string[];
  truncated: boolean;
  durationMs: number;
}

const logger = pino({ name: 'sql-server-client' });

export class SqlServerClient {
  private pool: sql.ConnectionPool | null = null;

  constructor(private readonly cfg: SqlClientConfig) {}

  private async getPool(): Promise<sql.ConnectionPool> {
    if (this.pool && this.pool.connected) return this.pool;

    this.pool = await new sql.ConnectionPool({
      server: this.cfg.host,
      port: this.cfg.port,
      database: this.cfg.database,
      user: this.cfg.user,
      password: this.cfg.password,
      options: {
        trustServerCertificate: this.cfg.trustServerCertificate,
        encrypt: this.cfg.encrypt,
      },
      requestTimeout: this.cfg.queryTimeoutSeconds * 1000,
      connectionTimeout: 15_000,
    }).connect();

    logger.info({ host: this.cfg.host, db: this.cfg.database }, 'SQL Server pool connected');
    return this.pool;
  }

  async query(sqlText: string, maxRowsOverride?: number): Promise<QueryResult> {
    const start = Date.now();
    const pool = await this.getPool();
    const request = pool.request();

    const result = await request.query(sqlText);
    const durationMs = Date.now() - start;

    const limit = maxRowsOverride ?? this.cfg.maxRows;
    const allRows = (result.recordset ?? []) as Record<string, unknown>[];
    const truncated = allRows.length > limit;
    const rows = truncated ? allRows.slice(0, limit) : allRows;
    const columns = allRows.length > 0 ? Object.keys(allRows[0]) : [];

    logger.debug(
      { rowCount: allRows.length, truncated, durationMs },
      'SQL query executed',
    );

    return { rows, rowCount: rows.length, columns, truncated, durationMs };
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.getPool();
      await this.query('SELECT 1 AS ping');
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }
}

/**
 * Builds a SqlClientConfig from org env vars.
 *
 * Supports two naming conventions (checked in order):
 *   1. DB_OPENMMS_* — preferred for NBP/OPENMMS deployments
 *      DB_OPENMMS_HOST, DB_OPENMMS_PORT, DB_OPENMMS_NAME, DB_OPENMMS_USER, DB_OPENMMS_PASS
 *   2. DB_* — legacy fallback
 *      DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 *
 * The DB_OPENMMS_ENGINE env var is accepted for compatibility with Python-style
 * config strings (e.g. "mssql+pymssql") but is IGNORED — this is a Node.js project
 * using the `mssql` (tedious) driver. Set DB_OPENMMS_HOST/PORT/NAME/USER/PASS instead.
 */
export function buildSqlConfig(env: Record<string, string>): SqlClientConfig {
  // Prefer OPENMMS-prefixed vars; fall back to generic DB_* vars.
  const host     = env['DB_OPENMMS_HOST']     ?? env['DB_HOST'];
  const port     = env['DB_OPENMMS_PORT']     ?? env['DB_PORT'];
  const dbName   = env['DB_OPENMMS_NAME']     ?? env['DB_NAME'];
  const user     = env['DB_OPENMMS_USER']     ?? env['DB_USER'];
  const password = env['DB_OPENMMS_PASS']     ?? env['DB_PASSWORD'];

  if (!host)     throw new Error('Missing DB host — set DB_OPENMMS_HOST or DB_HOST in .env');
  if (!dbName)   throw new Error('Missing DB name — set DB_OPENMMS_NAME or DB_NAME in .env');
  if (!user)     throw new Error('Missing DB user — set DB_OPENMMS_USER or DB_USER in .env');
  if (!password) throw new Error('Missing DB password — set DB_OPENMMS_PASS or DB_PASSWORD in .env');

  return {
    host,
    port: parseInt(port ?? '1433', 10),
    database: dbName,
    user,
    password,
    encrypt: (env['DB_ENCRYPT'] ?? 'true') === 'true',
    trustServerCertificate: (env['DB_TRUST_CERT'] ?? 'true') === 'true',
    queryTimeoutSeconds: parseInt(env['DB_QUERY_TIMEOUT_SECONDS'] ?? '30', 10),
    maxRows: parseInt(env['DB_MAX_ROWS'] ?? '500', 10),
  };
}
