/**
 * Tool: data_reporting.system_status
 * Returns connectivity and configuration status for @bot status command.
 */

import { z } from 'zod';
import type { ToolDefinition } from '../../../types/index.js';
import type { SqlServerClient } from '../lib/sqlServerClient.js';
import type { MemoryStore } from '../lib/memoryStore.js';

export const SystemStatusInput = z.object({}).describe('No parameters needed.');

export type SystemStatusInputType = z.infer<typeof SystemStatusInput>;

export interface SystemStatusResult {
  db: { ok: boolean; error?: string };
  memory: { enabled: boolean };
  dryRun: boolean;
  timezone: string;
}

export function buildSystemStatusTool(
  db: SqlServerClient,
  memoryStore: MemoryStore,
  env: Record<string, string>,
): ToolDefinition<SystemStatusInputType, SystemStatusResult> {
  return {
    name: 'data_reporting.system_status',
    description:
      'Checks and returns the current status of the database connection, memory store, ' +
      'and WhatsApp dry-run mode. Use this for the @bot status command.',
    inputSchema: SystemStatusInput,
    handler: async () => {
      const dbStatus = await db.testConnection();
      const memEnabled = (env['MEMORY_ENABLED'] ?? 'true') === 'true';
      const dryRun = (env['WHATSAPP_DRY_RUN'] ?? 'true') !== 'false';
      const timezone = env['REPORT_TIMEZONE'] ?? 'Asia/Karachi';

      return {
        db: dbStatus,
        memory: { enabled: memEnabled },
        dryRun,
        timezone,
      };
    },
  };
}
