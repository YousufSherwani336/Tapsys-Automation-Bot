/**
 * Data Reporting org adapter.
 * Called by registerModules.ts for each org that has the data_reporting module enabled.
 * Instantiates DB client, renderer, memory, audit logger from org env,
 * then registers all data_reporting tools into the ToolRegistry.
 */

import pino from 'pino';
import type { AdapterArgs } from '../../core/module-loader/adapters.js';
import type { ToolDefinition } from '../../types/index.js';
import { SqlServerClient, buildSqlConfig } from './lib/sqlServerClient.js';
import { ReportRenderer } from './lib/reportRenderer.js';
import { AuditLogger } from './lib/auditLogger.js';
import { MemoryStore } from './lib/memoryStore.js';
import { buildExecuteSqlTool } from './tools/executeSafeSql.js';
import { buildRenderReportTool } from './tools/renderReportImage.js';
import { buildRenderExcelTool } from './tools/renderExcelReport.js';
import { buildGetMemoryTool } from './tools/getReportMemory.js';
import { buildUpdateMemoryTool } from './tools/updateReportMemory.js';
import { buildSystemStatusTool } from './tools/systemStatus.js';
import { buildSendEmailTool } from './tools/sendEmail.js';
import { EmailClient, buildSmtpConfig } from './lib/emailClient.js';

const logger = pino({ name: 'data-reporting-adapter' });

export function applyDataReportingModule({ loadedModule, orgEnv, registry }: AdapterArgs & { orgSlug?: string }): void {
  // orgSlug comes from AdapterArgs if we extend it; otherwise fall back to env var.
  const orgSlug = (orgEnv['ORG'] ?? process.env['ORG'] ?? 'unknown');
  const allowedTools = new Set(loadedModule.manifest.tools);

  // ── Config from env ──────────────────────────────────────────────────────
  const outputDir = orgEnv['REPORT_OUTPUT_DIR'] ?? 'output/reports';
  const timezone = orgEnv['REPORT_TIMEZONE'] ?? 'Asia/Karachi';
  const auditLogPath = orgEnv['AUDIT_LOG_PATH'] ?? 'logs/audit.log';
  const memEnabled = (orgEnv['MEMORY_ENABLED'] ?? 'true') === 'true';
  const memDbPath = orgEnv['MEMORY_DB_PATH'] ?? 'data/memory.sqlite';

  // ── Services ─────────────────────────────────────────────────────────────
  const audit = new AuditLogger(auditLogPath, orgSlug);

  // DB client — defer connection until first query so startup doesn't fail
  // if DB_HOST is not yet configured.
  let db: SqlServerClient;
  try {
    const sqlCfg = buildSqlConfig(orgEnv);
    db = new SqlServerClient(sqlCfg);
    logger.info({ host: sqlCfg.host, db: sqlCfg.database }, 'SQL Server client created');
  } catch (err) {
    logger.warn({ err }, 'SQL Server config incomplete — execute_sql will return errors until DB env vars are set');
    // Create a stub that always returns an error so the rest of the module still loads.
    db = new Proxy({} as SqlServerClient, {
      get: (_, prop) => {
        if (prop === 'query' || prop === 'testConnection') {
          return async () => {
            if (prop === 'testConnection') return { ok: false, error: 'DB not configured' };
            throw new Error('SQL Server not configured. Set DB_HOST, DB_NAME, DB_USER, DB_PASSWORD in .env');
          };
        }
        if (prop === 'close') return async () => {};
        return undefined;
      },
    });
  }

  const renderer = new ReportRenderer({ outputDir, timezone });

  const memoryStore = new MemoryStore({ enabled: memEnabled, dbPath: memDbPath });
  // Init is async — fire and forget; store handles its own unavailability gracefully.
  memoryStore.init().catch((err) => logger.warn({ err }, 'Memory store init failed'));

  // Email client — optional, only if SMTP is configured
  let emailClient: EmailClient | null = null;
  try {
    const smtpCfg = buildSmtpConfig(orgEnv);
    emailClient = new EmailClient(smtpCfg);
  } catch (err) {
    logger.warn({ err }, 'SMTP config incomplete — send_email tool will not be available');
  }

  // ── Register tools ───────────────────────────────────────────────────────
  // Use a placeholder JID for tool construction — the actual from JID is
  // injected at tool call time via the audit logger entry.
  const PLACEHOLDER_JID = 'system';

  const allTools = [
    buildExecuteSqlTool(db, audit, PLACEHOLDER_JID),
    buildRenderReportTool(renderer, audit, PLACEHOLDER_JID, outputDir, timezone),
    buildRenderExcelTool(audit, PLACEHOLDER_JID, outputDir),
    buildGetMemoryTool(memoryStore),
    buildUpdateMemoryTool(memoryStore),
    buildSystemStatusTool(db, memoryStore, orgEnv),
    ...(emailClient ? [buildSendEmailTool(emailClient, audit, PLACEHOLDER_JID)] : []),
  ];

  for (const tool of allTools) {
    if (!allowedTools.has(tool.name)) {
      logger.debug({ tool: tool.name }, 'Tool not in manifest — skipping');
      continue;
    }
    registry.register(tool as ToolDefinition);
    logger.debug({ tool: tool.name }, 'Registered data_reporting tool');
  }
}
