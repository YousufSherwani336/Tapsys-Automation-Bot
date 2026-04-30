/**
 * Tool: data_reporting.execute_sql
 * Validates and executes a read-only T-SQL query. Returns rows as JSON.
 * SQL validator runs before every execution — no raw SQL ever bypasses it.
 */

import { z } from 'zod';
import type { ToolDefinition } from '../../../types/index.js';
import type { SqlServerClient } from '../lib/sqlServerClient.js';
import type { AuditLogger } from '../lib/auditLogger.js';
import { validateSql } from '../lib/sqlValidator.js';

export const ExecuteSqlInput = z.object({
  sql: z
    .string()
    .min(10)
    .describe('The T-SQL query to execute. Must start with SELECT, WITH, or DECLARE.'),
  queryDescription: z
    .string()
    .describe('Human-readable description of what this query retrieves.'),
  reportTitle: z
    .string()
    .describe('Title for the resulting report (used in image header).'),
  filters: z
    .record(z.string())
    .optional()
    .describe('Key-value map of applied filters for audit log.'),
});

export type ExecuteSqlInputType = z.infer<typeof ExecuteSqlInput>;

export interface ExecuteSqlResult {
  success: boolean;
  rows: Record<string, unknown>[];
  columns: string[];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
  reportTitle: string;
  error?: string;
}

export function buildExecuteSqlTool(
  db: SqlServerClient,
  audit: AuditLogger,
  from: string,
): ToolDefinition<ExecuteSqlInputType, ExecuteSqlResult> {
  return {
    name: 'data_reporting.execute_sql',
    description:
      'Validates and executes a read-only T-SQL query on the TAPSYS SQL Server database. ' +
      'Returns rows as a JSON array. The validator rejects any destructive SQL before execution.',
    inputSchema: ExecuteSqlInput,
    handler: async (input) => {
      // 1. Validate
      const validation = validateSql(input.sql);
      if (!validation.valid) {
        await audit.log({
          from,
          action: 'execute_sql',
          queryDescription: input.queryDescription,
          filters: input.filters,
          status: 'rejected',
          reason: validation.reason,
        });
        return {
          success: false,
          rows: [],
          columns: [],
          rowCount: 0,
          truncated: false,
          durationMs: 0,
          reportTitle: input.reportTitle,
          error: `SQL rejected: ${validation.reason}`,
        };
      }

      // 2. Execute
      try {
        const result = await db.query(validation.cleanedSql!);
        await audit.log({
          from,
          action: 'execute_sql',
          queryDescription: input.queryDescription,
          filters: input.filters,
          rowsReturned: result.rowCount,
          durationMs: result.durationMs,
          status: 'ok',
        });
        return {
          success: true,
          rows: result.rows,
          columns: result.columns,
          rowCount: result.rowCount,
          truncated: result.truncated,
          durationMs: result.durationMs,
          reportTitle: input.reportTitle,
        };
      } catch (err) {
        const message = (err as Error).message ?? 'Unknown DB error';
        // Never log the full error message if it might contain query text or data
        await audit.log({
          from,
          action: 'execute_sql',
          queryDescription: input.queryDescription,
          status: 'error',
          reason: 'DB execution error',
        });
        return {
          success: false,
          rows: [],
          columns: [],
          rowCount: 0,
          truncated: false,
          durationMs: 0,
          reportTitle: input.reportTitle,
          error: `Database error: ${message}`,
        };
      }
    },
  };
}
