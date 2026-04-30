/**
 * SQLite-backed memory store for per-user/group report preferences.
 * Stores non-sensitive preference data only — no SQL results, no secrets.
 */

import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import pino from 'pino';

const logger = pino({ name: 'memory-store' });

export interface UserMemory {
  jid: string;
  preferredMerchant?: string;
  preferredMid?: string;
  preferredRegion?: string;
  preferredDateRange?: string;
  preferredReportType?: string;
  lastReportPath?: string;
  lastReportCaption?: string;
  updatedAt: string;
}

/** Wraps better-sqlite3 with lazy init and graceful disable. */
export class MemoryStore {
  private db: import('better-sqlite3').Database | null = null;
  private readonly enabled: boolean;
  private readonly dbPath: string;

  constructor(options: { enabled: boolean; dbPath: string }) {
    this.enabled = options.enabled;
    this.dbPath = options.dbPath;
  }

  async init(): Promise<void> {
    if (!this.enabled) return;
    try {
      await mkdir(dirname(this.dbPath), { recursive: true });
      // Dynamic import so the module loads even if better-sqlite3 isn't installed.
      const BetterSqlite3 = (await import('better-sqlite3')).default;
      this.db = new BetterSqlite3(this.dbPath);
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS user_memory (
          jid TEXT PRIMARY KEY,
          preferred_merchant TEXT,
          preferred_mid TEXT,
          preferred_region TEXT,
          preferred_date_range TEXT,
          preferred_report_type TEXT,
          last_report_path TEXT,
          last_report_caption TEXT,
          updated_at TEXT NOT NULL
        )
      `);
      logger.info({ dbPath: this.dbPath }, 'Memory store initialized');
    } catch (err) {
      logger.warn({ err }, 'Memory store unavailable — running without memory');
      this.db = null;
    }
  }

  getMemory(jid: string): UserMemory | null {
    if (!this.db) return null;
    try {
      const row = this.db
        .prepare('SELECT * FROM user_memory WHERE jid = ?')
        .get(jid) as Record<string, unknown> | undefined;

      if (!row) return null;
      return {
        jid: row['jid'] as string,
        preferredMerchant: (row['preferred_merchant'] as string) || undefined,
        preferredMid: (row['preferred_mid'] as string) || undefined,
        preferredRegion: (row['preferred_region'] as string) || undefined,
        preferredDateRange: (row['preferred_date_range'] as string) || undefined,
        preferredReportType: (row['preferred_report_type'] as string) || undefined,
        lastReportPath: (row['last_report_path'] as string) || undefined,
        lastReportCaption: (row['last_report_caption'] as string) || undefined,
        updatedAt: row['updated_at'] as string,
      };
    } catch {
      return null;
    }
  }

  updateMemory(jid: string, updates: Partial<Omit<UserMemory, 'jid' | 'updatedAt'>>): void {
    if (!this.db) return;
    try {
      const existing = this.getMemory(jid);
      const now = new Date().toISOString();
      const merged = { ...existing, ...updates };

      this.db.prepare(`
        INSERT INTO user_memory (
          jid, preferred_merchant, preferred_mid, preferred_region,
          preferred_date_range, preferred_report_type,
          last_report_path, last_report_caption, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(jid) DO UPDATE SET
          preferred_merchant   = excluded.preferred_merchant,
          preferred_mid        = excluded.preferred_mid,
          preferred_region     = excluded.preferred_region,
          preferred_date_range = excluded.preferred_date_range,
          preferred_report_type = excluded.preferred_report_type,
          last_report_path     = excluded.last_report_path,
          last_report_caption  = excluded.last_report_caption,
          updated_at           = excluded.updated_at
      `).run(
        jid,
        merged.preferredMerchant ?? null,
        merged.preferredMid ?? null,
        merged.preferredRegion ?? null,
        merged.preferredDateRange ?? null,
        merged.preferredReportType ?? null,
        merged.lastReportPath ?? null,
        merged.lastReportCaption ?? null,
        now,
      );
    } catch (err) {
      logger.warn({ err, jid }, 'Failed to update memory');
    }
  }

  clearMemory(jid: string): void {
    if (!this.db) return;
    try {
      this.db.prepare('DELETE FROM user_memory WHERE jid = ?').run(jid);
    } catch (err) {
      logger.warn({ err, jid }, 'Failed to clear memory');
    }
  }
}
