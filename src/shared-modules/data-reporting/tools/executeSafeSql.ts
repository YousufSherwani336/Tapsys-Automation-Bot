/**
 * Tool: data_reporting.execute_sql
 * Validates and executes a read-only T-SQL query. Returns rows as JSON.
 * SQL validator runs before every execution — no raw SQL ever bypasses it.
 *
 * For large results (>20 rows), rows are stored in an in-memory result store
 * and only a preview (first 5 rows) + resultRef is returned to the LLM.
 * The render_excel / render_report tools can then pull full data via resultRef.
 */

import { z } from 'zod';
import type { ToolDefinition } from '../../../types/index.js';
import type { SqlServerClient } from '../lib/sqlServerClient.js';
import type { AuditLogger } from '../lib/auditLogger.js';
import { validateSql } from '../lib/sqlValidator.js';
import { storeResult } from '../lib/resultStore.js';

/** Max rows to include inline in the tool response to the LLM. */
const INLINE_ROW_LIMIT = 20;

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
  maxRows: z
    .number()
    .int()
    .min(1)
    .max(50000)
    .optional()
    .describe('Override the default row limit (500). Use up to 50000 for Excel exports to return complete data.'),
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
  resultRef?: string;
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
      'Returns rows as a JSON array. For large results (>20 rows), only a preview is returned ' +
      'along with a resultRef string. Pass this resultRef to render_excel or render_report to use the full data.',
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
        const result = await db.query(validation.cleanedSql!, input.maxRows);
        await audit.log({
          from,
          action: 'execute_sql',
          queryDescription: input.queryDescription,
          filters: input.filters,
          rowsReturned: result.rowCount,
          durationMs: result.durationMs,
          status: 'ok',
        });

        // 3. For large results, store in memory and return only a preview
        if (result.rows.length > INLINE_ROW_LIMIT) {
          const ref = storeResult(result.rows, result.columns);
          return {
            success: true,
            rows: result.rows.slice(0, 5), // Preview: first 5 rows only
            columns: result.columns,
            rowCount: result.rowCount,
            truncated: result.truncated,
            durationMs: result.durationMs,
            reportTitle: input.reportTitle,
            resultRef: ref,
          };
        }

        // Small results: return inline as before
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
