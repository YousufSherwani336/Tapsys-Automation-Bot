# Final Implementation Report — Paysys WhatsApp Data Reporting Agent (NBP)

**Date:** 2026-04-29  
**Project:** whatsapp-pi-agent (Paysys Labs / NBP RAAST)  
**Agent version:** 0.1.0  
**Prepared by:** Claude Sonnet 4.6 (automated implementation session)

---

## A. Project Overview

This report documents the full conversion of the `whatsapp-pi-agent-main` project from a Jira ticket assistant into a **WhatsApp Data Reporting AI Agent** for the NBP <-> Tapsys settlement group. The agent listens to a specific WhatsApp group, responds to natural language queries in English and Roman Urdu, generates SQL against a read-only SQL Server database (OPENMMS), and replies with either formatted text or a PNG chart image.

---

## B. Architecture Summary

```
WhatsApp (Baileys)
    │
    ▼
NormalizedMessage  ──────────────────────────────────────────────┐
    │  (isMentioned, from, text)                                  │
    ▼                                                             │
SequentialQueue                                                   │
    │                                                             │
    ▼                                                             │
Pi Agent (Anthropic claude-sonnet-4-20250514)                     │
    │  system prompt = BASE_PROMPT + org overlay + module prompt  │
    │  tools = execute_sql, render_report_image,                  │
    │          get_memory, update_memory, system_status           │
    ▼                                                             │
AgentResponse JSON  {"type":"image"|"text"|"clarification",...}   │
    │                                                             │
    ▼                                                             │
dispatchReply  ──────── dryRun=true? → log only ─────────────────┘
    │
    ▼
wa.sendText() / wa.sendImage()
```

**Key SDK:** `@mariozechner/pi-ai` — multi-provider LLM wrapper (NOT direct Anthropic SDK).  
**WhatsApp:** `@whiskeysockets/baileys` v7 (WhatsApp Web protocol).  
**DB driver:** `mssql` (Node.js tedious driver — NOT Python/pymssql).

---

## C. Module System

Modules are declared in `orgs/<slug>/modules/<name>/manifest.yaml`. The module loader at startup:

1. Reads all `manifest.yaml` files under the org's `modules/` directory
2. Skips any module with `enabled: false`
3. For enabled modules, calls the registered adapter (e.g., `applyDataReportingModule`)
4. The adapter wires DB client, renderer, memory, and audit logger from the org's scoped `.env`
5. Registers tools into `ToolRegistry`, filtered by `manifest.tools` allowlist

**Active modules for `paysys`:**
- `data_reporting` — enabled, 5 tools registered
- `jira` — disabled (`enabled: false`)

---

## D. Data Reporting Module — Tools

| Tool name | Purpose |
|-----------|---------|
| `execute_sql` | Validates SQL (whitelist), executes against OPENMMS, returns rows |
| `render_report_image` | Renders query result as PNG table using node-canvas |
| `get_memory` | Retrieves per-user key/value from SQLite memory store |
| `update_memory` | Stores per-user key/value in SQLite memory store |
| `system_status` | Returns DB connectivity, memory status, env summary |

---

## E. SQL Safety Validator

File: [src/shared-modules/data-reporting/lib/sqlValidator.ts](../src/shared-modules/data-reporting/lib/sqlValidator.ts)

**Strategy:** whitelist + blocklist

1. Strip SQL comments (`--` single-line, `/* */` multi-line) before analysis
2. Block any query containing forbidden keywords (word-boundary regex):
   `INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, MERGE, CREATE, GRANT, REVOKE, XP_CMDSHELL, SP_CONFIGURE, SP_EXECUTESQL, OPENROWSET, OPENDATASOURCE, BULK INSERT, WRITETEXT, UPDATETEXT, RECONFIGURE, SHUTDOWN`
3. Block `EXEC` / `EXECUTE` (dynamic SQL)
4. Block semicolons in non-DECLARE lines (stacked statement prevention)
5. Allow only `SELECT`, `WITH` (CTEs), and `DECLARE` (T-SQL date variables) as first keyword
6. If starts with `DECLARE`, require a `SELECT` to be present

**Result type:** `{ valid: boolean, reason?: string, cleanedSql?: string }`

---

## F. NBP SQL Catalog

**Active catalog:** `nbp-raast-thirdparty-records`  
**Location:** [orgs/paysys/modules/data_reporting/prompt.md](../orgs/paysys/modules/data_reporting/prompt.md)  
**Standalone copy:** [orgs/paysys/sql_catalog/nbp-raast-thirdparty-records.md](../orgs/paysys/sql_catalog/nbp-raast-thirdparty-records.md)  
**Schema snapshot:** [orgs/paysys/sql_catalog/nbp-schema-snapshot.md](../orgs/paysys/sql_catalog/nbp-schema-snapshot.md)

**Tables used:**
- `OPENMMS.dbo.raast_thirdparty_records` — main fact table
- `OPENMMS.dbo.merchant` — merchant master (LEFT JOIN only)
- `OPENMMS.dbo.terminal` — terminal master (LEFT JOIN only)

**Always-applied safety filters:**
```sql
rtr.response_code = '00'      -- successful txns only
rtr.aggregator_code = '00087' -- NBP aggregator only
```

**5 base queries available:**
1. NBP Summary Dashboard (yesterday / MTD / last-30-day counts + volumes + active merchants/terminals)
2. Top 10 Merchants by Volume (configurable date range)
3. Single Merchant Summary (by ID or name LIKE)
4. Single Terminal Summary (by TID)
5. Active Merchants & Terminals Dashboard (last 30 days)

**Old MPOS/TAPSYS catalog** (`aggregator_code IN ('729','9','72')`, `digital_onboarding_type='MPOS'`) is completely disabled — removed from all prompt files.

---

## G. Group & Bot Configuration

File: [orgs/paysys/config.yaml](../orgs/paysys/config.yaml)

```yaml
orgSlug: paysys
whatsapp:
  groupId: "120363431246112155@g.us"   # NBP <-> Tapsys group
  requireMention: true
group:
  displayName: "NBP <-> Tapsys"
  botMentionNumber: "03011111716"
database:
  profile: OPENMMS
catalog:
  active: nbp-raast-thirdparty-records
reporting:
  timezone: Asia/Karachi
  defaultDateRange: yesterday
  defaultReport: nbp_summary_dashboard
```

---

## H. Environment Variables

File: [orgs/paysys/.env.example](../orgs/paysys/.env.example)

| Variable | Value (example) | Notes |
|----------|-----------------|-------|
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Required for LLM calls |
| `PI_MODEL_PROVIDER` | `anthropic` | LLM provider |
| `PI_MODEL_NAME` | `claude-sonnet-4-20250514` | LLM model |
| `DB_OPENMMS_HOST` | `192.168.196.9` | SQL Server host |
| `DB_OPENMMS_PORT` | `1440` | SQL Server port |
| `DB_OPENMMS_NAME` | `OPENMMS` | Database name |
| `DB_OPENMMS_USER` | `sreuser` | Read-only DB user |
| `DB_OPENMMS_PASS` | *(empty — must fill)* | DB password |
| `DB_TRUST_CERT` | `true` | Trust self-signed cert |
| `DB_QUERY_TIMEOUT_SECONDS` | `30` | Per-query timeout |
| `DB_MAX_ROWS` | `500` | Row limit per query |
| `WHATSAPP_DRY_RUN` | `true` | **MUST be true during testing** |
| `REPORT_OUTPUT_DIR` | `output/reports` | PNG output directory |
| `REPORT_TIMEZONE` | `Asia/Karachi` | Report timezone |
| `MEMORY_ENABLED` | `true` | SQLite memory store |
| `MEMORY_DB_PATH` | `data/memory.sqlite` | Memory store path |
| `AUDIT_LOG_PATH` | `logs/audit.log` | Audit log path |

**Note:** `DB_OPENMMS_ENGINE=mssql+pymssql` is accepted for compatibility but **ignored** — this is a Node.js project using the `mssql` (tedious) driver.

---

## I. Bot Mention Detection

File: [src/core/whatsapp/normalize.ts](../src/core/whatsapp/normalize.ts)

- DMs (non-group messages) are always treated as mentioned (`isMentioned = true`)
- In groups: checks `contextInfo.mentionedJid` array from Baileys for the bot's JID
- Also checks if the message text contains `@<botNumber>` (e.g., `@03011111716`)
- If `requireMention: true` in config, messages without a mention are silently dropped

---

## J. Structured Response Protocol

The LLM is instructed to end every reply with a JSON block of one of these shapes:

```json
{"type": "image", "imagePath": "output/reports/report.png", "caption": "NBP Summary — 28 Apr"}
{"type": "text", "message": "Yesterday: 1,234 txns, PKR 5.6M"}
{"type": "clarification", "message": "Multiple merchants found. Please specify MID."}
{"type": "error", "message": "Could not connect to DB."}
{"type": "last_report"}
```

`bootstrap.ts:parseAgentReply()` scans for the **last** valid JSON block in the reply (robust against LLM text before the JSON) and dispatches to `wa.sendImage()` or `wa.sendText()` accordingly.

**Bug fixed:** the original greedy regex `/{[^}]*}/` failed on JSON with nested objects. Replaced with a proper brace-depth parser (`findMatchingClose`) that correctly handles nested objects and string literals.

---

## K. Dry-Run Mode

`WHATSAPP_DRY_RUN=true` (default):
- All `wa.sendText()` and `wa.sendImage()` calls are replaced with `logger.info('[DRY_RUN] Would send ...')`
- The agent still runs the full pipeline: LLM inference → SQL validation → DB query → image render
- Only the final WhatsApp dispatch is suppressed

Set `WHATSAPP_DRY_RUN=false` only after successful QR scan on the real device and after verifying the first few replies in dry-run mode.

---

## L. Memory Store

File: [src/shared-modules/data-reporting/lib/memoryStore.ts](../src/shared-modules/data-reporting/lib/memoryStore.ts)

- Backed by `better-sqlite3` (SQLite)
- Per-user key/value store, keyed by WhatsApp JID
- Used by the agent to remember last report path, last query, user preferences
- Gracefully handles `MEMORY_ENABLED=false` — all calls become no-ops

---

## M. Audit Logging

File: [src/shared-modules/data-reporting/lib/auditLogger.ts](../src/shared-modules/data-reporting/lib/auditLogger.ts)

- Append-only JSONL file at `logs/audit.log`
- Records: timestamp, org, from JID, SQL query, row count, duration, tool name
- Used for compliance and debugging

---

## N. Timezone Safety

File: [src/shared-modules/data-reporting/lib/dateParser.ts](../src/shared-modules/data-reporting/lib/dateParser.ts)

**Bug fixed:** `toISOString()` converts to UTC, which causes off-by-one date errors for UTC+5 (Pakistan Standard Time). Fixed by using `getFullYear()/getMonth()/getDate()` (local date components) instead.

```typescript
// CORRECT for UTC+5
function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
```

All SQL `DECLARE` date variables in queries use server-side `GETDATE()` (SQL Server, Asia/Karachi server time), so they are inherently timezone-correct without any client-side date injection.

---

## O. Image Report Generation

File: [src/shared-modules/data-reporting/lib/reportRenderer.ts](../src/shared-modules/data-reporting/lib/reportRenderer.ts)

- Uses `canvas` (node-canvas, backed by Cairo) for PNG rendering
- Renders a table: header row, data rows, column alignment
- **Graceful fallback:** if `canvas` native binaries are not installed, logs a warning and returns a text-format report instead — agent does not crash
- On Linux: requires `libcairo2-dev`, `libpango1.0-dev`, `libjpeg-dev` (see Section R)

**Build note:** `@types/canvas` does not exist on npm — `canvas` ships its own types. Removed from `devDependencies`. Internal import uses `import type { CanvasRenderingContext2D as CanvasCtx } from 'canvas'` to avoid DOM type collisions.

---

## P. WhatsApp Image Sending

File: [src/core/whatsapp/send.ts](../src/core/whatsapp/send.ts)

```typescript
async sendImage(jid: string, imagePath: string, caption: string): Promise<void> {
  const imageBuffer = await readFile(imagePath);
  await sock.sendMessage(jid, { image: imageBuffer, caption });
}
```

`WhatsAppConnection` interface exposes both `sendText()` and `sendImage()`.

---

## Q. TypeScript Fixes

| Issue | Root cause | Fix |
|-------|-----------|-----|
| `canvas` context type mismatch | Canvas lib's `CanvasRenderingContext2D` differs from DOM's | `import type { CanvasRenderingContext2D as CanvasCtx } from 'canvas'` + cast `as unknown as CanvasCtx` |
| `renderReportImage.ts` Zod `.default()` mismatch | `.default('table')` makes input type `string \| undefined` but output non-optional | Changed to `.optional()`, default applied in handler |
| `orgAdapter.ts` generic covariance error | `ToolDefinition<ConcreteInput, Result>` not assignable to `ToolDefinition<unknown, unknown>` | Cast `tool as ToolDefinition` at registration |
| `@types/canvas` not on npm | Package does not exist | Removed from `devDependencies` |

---

## R. Linux Deployment Files

| File | Purpose |
|------|---------|
| [deploy/linux-setup.md](../deploy/linux-setup.md) | Full Ubuntu/Debian setup guide with exact `apt-get` commands |
| [deploy/paysys-agent.service](../deploy/paysys-agent.service) | systemd service unit file |
| [deploy/start.sh](../deploy/start.sh) | Shell startup script (PM2 preferred, direct Node.js fallback) |
| [pm2.config.cjs](../pm2.config.cjs) | PM2 process config (updated to `paysys-agent` org) |

**Linux native dependencies for `canvas`:**
```bash
sudo apt-get install -y \
  build-essential libcairo2-dev libpango1.0-dev \
  libjpeg-dev libgif-dev librsvg2-dev pkg-config python3
```

---

## S. Test Results

**Final state: 144 tests, 16 test files, 0 failures**

| Test file | Tests | Coverage |
|-----------|-------|----------|
| `tests/dry-run-prompts.test.ts` | 22 | 14 positive NBP prompt simulations + 8 security/negative tests |
| `src/shared-modules/data-reporting/tests/sqlValidator.test.ts` | 14 | SQL whitelist validator |
| `src/shared-modules/data-reporting/tests/dateParser.test.ts` | 10 | English + Roman Urdu date parsing |
| `src/shared-modules/data-reporting/tests/merchantResolver.test.ts` | 5 | Merchant name/ID disambiguation |
| `src/core/whatsapp/normalize.test.ts` | 14 | Mention detection, DM vs group, JID normalization |
| `src/core/module-loader/loadModule.test.ts` | 8 | Module load, disabled modules, tool allowlist |
| `src/core/agent-runtime/toolRegistry.test.ts` | 8 | Tool registration and lookup |
| `src/core/queue/sequentialQueue.test.ts` | 8 | Sequential message processing |
| `src/core/config/loadOrgConfig.test.ts` | 4 | Org config loading |
| `src/shared-modules/jira-core/orgAdapter.test.ts` | 9 | Jira adapter (disabled for paysys) |
| `src/shared-modules/jira-core/jiraCore.test.ts` | 11 | Jira core (still tested, module disabled in paysys) |
| `src/core/agent-runtime/composePrompt.test.ts` | 5 | System prompt composition |
| `src/core/agent-runtime/createAgent.test.ts` | 4 | Agent creation |
| `src/core/agent-runtime/assertToolsAllowed.test.ts` | 5 | Tool permission checks |
| `src/orgTemplate.test.ts` | 3 | Org directory structure |
| `src/scaffold.test.ts` | 14 | Project scaffold validation |

### Dry-run Prompt Test Results (P1–P14)

| ID | User says | Intent | SQL valid | Notes |
|----|-----------|--------|-----------|-------|
| P1 | "NBP ka dashboard bhejo" | nbp_summary_dashboard | ✅ | Contains all 3 safety filters |
| P2 | "kal ka NBP summary" | nbp_summary_dashboard | ✅ | |
| P3 | "MTD volume batao" | nbp_summary_dashboard MTD | ✅ | Contains DATEFROMPARTS |
| P4 | "top 10 merchants MTD" | top_10_merchants | ✅ | TOP 10 + ORDER BY |
| P5 | "merchant 12345 ka data" | single_merchant | ✅ | merchant_id = 12345 |
| P6 | "MID 99 ka data" | single_merchant | ✅ | |
| P7 | "TID T001 ka data" | single_terminal | ✅ | rtr.tid = 'T001' |
| P8 | "last 30 days active merchants" | active_merchants_terminals | ✅ | DISTINCT counts |
| P9 | "active terminal percentage" | active_merchants_terminals | ✅ | |
| P10 | All query templates | — | ✅ | DECLARE present in all |
| P11 | "kal" date parse | yesterday | ✅ | startDate == endDate |
| P12 | "MTD" date parse | mtd | ✅ | start ends in -01 |
| P13 | "last 30 days" date parse | last_30_days | ✅ | 29-day window |
| P14 | All queries | LEFT JOIN check | ✅ | No INNER JOIN |

### Security Test Results (S1–S8)

| ID | Attack | Blocked | Reason |
|----|--------|---------|--------|
| S1 | DROP TABLE | ✅ | Blocked keyword: DROP |
| S2 | DELETE FROM | ✅ | Blocked keyword: DELETE |
| S3 | UPDATE SET | ✅ | Blocked keyword: UPDATE |
| S4 | INSERT INTO | ✅ | Blocked keyword: INSERT |
| S5 | SELECT; EXEC xp_cmdshell | ✅ | Semicolon in SELECT body blocked |
| S6 | TRUNCATE TABLE | ✅ | Blocked keyword: TRUNCATE |
| S7 | ALTER TABLE | ✅ | Blocked keyword: ALTER |
| S8 | EXECUTE sp_configure | ✅ | EXEC/EXECUTE blocked |

---

## T. Known Limitations / Not Yet Verified

1. **DB connectivity** — `SELECT 1` on real OPENMMS (`192.168.196.9:1440`) has NOT been tested. Requires `DB_OPENMMS_PASS` in `.env`. Test with `system status` message to the bot or `testConnection()` call.

2. **Canvas native binaries** — Image generation requires Cairo libraries installed. On Windows dev machine, `canvas` was installed with `--ignore-scripts`. On Linux production, run `npm install` normally after installing `libcairo2-dev` etc.

3. **WhatsApp QR scan** — First startup requires physical phone with WhatsApp to scan the QR code. Session persists at `orgs/paysys/runtime/auth/`.

4. **`WHATSAPP_DRY_RUN`** — Must be changed to `false` in production `.env` after testing.

5. **Region/KYC joins** — The schema snapshot notes that city/region KYC data may be joinable, but column names were not verified. Treat region as 'Unknown' if joins fail.

---

## U. Files Changed / Created (Complete List)

### Modified files

| File | Change |
|------|--------|
| `orgs/paysys/config.yaml` | NBP group ID, bot number, OPENMMS profile, NBP catalog reference |
| `orgs/paysys/modules/data_reporting/prompt.md` | Replaced MPOS/TAPSYS catalog with full NBP raast_thirdparty_records catalog |
| `orgs/paysys/modules/jira/manifest.yaml` | `enabled: false` |
| `orgs/paysys/.env.example` | DB_OPENMMS_* vars, ANTHROPIC_API_KEY, WHATSAPP_DRY_RUN=true |
| `pm2.config.cjs` | Updated to paysys-agent (removed example/example2 stubs) |
| `package.json` | Removed non-existent `@types/canvas` devDependency |
| `.gitignore` | Added `!orgs/example/.env` exception for test fixture |
| `src/core/bootstrap/bootstrap.ts` | Fixed parseAgentReply with proper brace-depth parser; added dispatchReply image/text/clarification/error/last_report dispatch; dry-run support |
| `src/core/config/schema.ts` | Added `requireMention?: boolean` to whatsapp config schema |
| `src/core/whatsapp/normalize.ts` | Added `isMentioned` to NormalizedMessage; botJid param; mention detection |
| `src/core/whatsapp/send.ts` | Added `sendImage()` using readFile + Baileys image buffer |
| `src/core/whatsapp/connect.ts` | Captures `sock.user.id` as botJid on open; passes to normalizeMessage; reads requireMention; exposes sendImage on WhatsAppConnection |
| `src/core/module-loader/adapters.ts` | Added `data_reporting: applyDataReportingModule` |
| `src/core/module-loader/registerModules.ts` | Added `enabled` check to skip disabled modules |
| `src/shared-modules/data-reporting/lib/sqlServerClient.ts` | Support DB_OPENMMS_* env vars (preferred) with DB_* fallback; documented ENGINE ignored |
| `src/shared-modules/data-reporting/lib/reportRenderer.ts` | Fixed canvas type import (no DOM collision); added tryLoadCanvas smoke-test; graceful text fallback |
| `src/shared-modules/data-reporting/lib/dateParser.ts` | Fixed toIso() to use local date components (not UTC toISOString) |
| `src/shared-modules/data-reporting/orgAdapter.ts` | Dynamic orgSlug from env; cast tool as ToolDefinition |
| `src/shared-modules/data-reporting/tools/renderReportImage.ts` | Changed `.default('table')` to `.optional()` for Zod schema |

### New files

| File | Purpose |
|------|---------|
| `orgs/example/.env` | Test fixture for orgTemplate.test.ts |
| `orgs/paysys/sql_catalog/nbp-raast-thirdparty-records.md` | Standalone NBP SQL catalog |
| `orgs/paysys/sql_catalog/nbp-schema-snapshot.md` | OPENMMS table/column reference + schema discovery queries |
| `deploy/paysys-agent.service` | systemd service unit for production Linux deployment |
| `deploy/start.sh` | Startup shell script (PM2 preferred, direct Node.js fallback) |
| `deploy/linux-setup.md` | Full Ubuntu/Debian deployment guide |
| `src/shared-modules/data-reporting/tests/sqlValidator.test.ts` | 14 SQL validator tests |
| `src/shared-modules/data-reporting/tests/dateParser.test.ts` | 10 date parser tests |
| `src/shared-modules/data-reporting/tests/merchantResolver.test.ts` | 5 merchant resolver tests |
| `tests/dry-run-prompts.test.ts` | 22 dry-run prompt simulation tests (14 positive + 8 security) |
| `docs/FINAL_REPORT.md` | This document |
