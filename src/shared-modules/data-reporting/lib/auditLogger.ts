/**
 * Append-only audit logger.
 * Every SQL execution and tool call is logged here for compliance.
 * Secrets (DB_PASSWORD, API keys) must never be passed to this module.
 */

import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface AuditEntry {
  ts: string;
  org: string;
  from: string;      // WhatsApp JID (no full message body)
  action: string;    // e.g. "execute_sql", "render_report"
  queryDescription?: string;
  filters?: Record<string, unknown>;
  rowsReturned?: number;
  durationMs?: number;
  status: 'ok' | 'rejected' | 'error';
  reason?: string;
}

export class AuditLogger {
  constructor(
    private readonly logPath: string,
    private readonly orgSlug: string,
  ) {}

  async log(entry: Omit<AuditEntry, 'ts' | 'org'>): Promise<void> {
    const full: AuditEntry = {
      ts: new Date().toISOString(),
      org: this.orgSlug,
      ...entry,
    };
    const line = JSON.stringify(full) + '\n';
    try {
      await mkdir(dirname(this.logPath), { recursive: true });
      await appendFile(this.logPath, line, 'utf8');
    } catch {
      // Non-fatal — log to stderr but don't break the bot
      process.stderr.write(`[audit-logger] Failed to write audit log: ${line}`);
    }
  }
}
