/**
 * DB connectivity verification script.
 * Run with: ORG=paysys npx tsx scripts/verify-db.ts
 *
 * Prerequisites: orgs/paysys/.env must exist with real DB credentials.
 * Does NOT require WhatsApp or LLM. Read-only queries only.
 */

import dotenv from 'dotenv';
import { resolve, join } from 'node:path';
import { SqlServerClient, buildSqlConfig } from '../src/shared-modules/data-reporting/lib/sqlServerClient.js';

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  DB CONNECTIVITY VERIFICATION — ORG=paysys');
  console.log('══════════════════════════════════════════════════════\n');

  const slug = process.env['ORG'] ?? 'paysys';
  const envPath = join(resolve(process.cwd(), 'orgs'), slug, '.env');
  const env: Record<string, string> = {};
  dotenv.config({ path: envPath, processEnv: env });

  if (!env['DB_OPENMMS_PASS']) {
    console.error('[BLOCKED] DB_OPENMMS_PASS is not set in orgs/paysys/.env');
    console.error('          Copy orgs/paysys/.env.example → orgs/paysys/.env and fill in DB_OPENMMS_PASS');
    process.exit(1);
  }

  console.log(`  Host:     ${env['DB_OPENMMS_HOST'] ?? '(not set)'}`);
  console.log(`  Port:     ${env['DB_OPENMMS_PORT'] ?? '1440'}`);
  console.log(`  Database: ${env['DB_OPENMMS_NAME'] ?? '(not set)'}`);
  console.log(`  User:     ${env['DB_OPENMMS_USER'] ?? '(not set)'}`);
  console.log(`  Password: ${'*'.repeat(8)} (hidden)\n`);

  const cfg = buildSqlConfig(env);
  const db = new SqlServerClient(cfg);

  // ── Test 1: Basic connectivity ───────────────────────────────────────────
  console.log('[ 1/5 ] SELECT 1 (ping)...');
  const ping = await db.testConnection();
  if (!ping.ok) {
    console.error(`  ✗ FAILED: ${ping.error}`);
    process.exit(1);
  }
  console.log('        ✓ Connected\n');

  // ── Test 2: Schema inspection — raast_thirdparty_records ────────────────
  console.log('[ 2/5 ] Schema: OPENMMS.dbo.raast_thirdparty_records...');
  const rtrCols = await db.query(`
    SELECT TOP 20 COLUMN_NAME, DATA_TYPE, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'raast_thirdparty_records'
    ORDER BY ORDINAL_POSITION
  `);
  console.log(`        Columns found: ${rtrCols.rowCount}`);
  for (const row of rtrCols.rows) {
    console.log(`          ${String(row['COLUMN_NAME']).padEnd(25)} ${String(row['DATA_TYPE']).padEnd(15)} nullable=${row['IS_NULLABLE']}`);
  }

  // ── Test 3: Schema inspection — terminal ─────────────────────────────────
  console.log('\n[ 3/5 ] Schema: OPENMMS.dbo.terminal...');
  const termCols = await db.query(`
    SELECT TOP 20 COLUMN_NAME, DATA_TYPE, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'terminal'
    ORDER BY ORDINAL_POSITION
  `);
  console.log(`        Columns found: ${termCols.rowCount}`);
  for (const row of termCols.rows) {
    console.log(`          ${String(row['COLUMN_NAME']).padEnd(25)} ${String(row['DATA_TYPE']).padEnd(15)} nullable=${row['IS_NULLABLE']}`);
  }

  // ── Test 4: Schema inspection — merchant ─────────────────────────────────
  console.log('\n[ 4/5 ] Schema: OPENMMS.dbo.merchant...');
  const merchCols = await db.query(`
    SELECT TOP 20 COLUMN_NAME, DATA_TYPE, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'merchant'
    ORDER BY ORDINAL_POSITION
  `);
  console.log(`        Columns found: ${merchCols.rowCount}`);
  for (const row of merchCols.rows) {
    console.log(`          ${String(row['COLUMN_NAME']).padEnd(25)} ${String(row['DATA_TYPE']).padEnd(15)} nullable=${row['IS_NULLABLE']}`);
  }

  // ── Test 5: NBP base query (last 30 days summary, no raw data) ───────────
  console.log('\n[ 5/5 ] NBP summary query (last 30 days)...');
  const summary = await db.query(`
    DECLARE @last30_start DATE = CAST(DATEADD(DAY, -30, GETDATE()) AS DATE)
    DECLARE @end_date     DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
    SELECT
        COUNT(DISTINCT rtr.merchant_id)        AS ActiveMerchants,
        COUNT(DISTINCT rtr.tid)                AS ActiveTerminals,
        COUNT(rtr.id)                          AS TotalTransactions,
        CAST(SUM(rtr.amount) AS DECIMAL(18,2)) AS TotalVolume,
        MAX(CAST(rtr.created_on AS DATE))      AS LatestTxnDate
    FROM OPENMMS.dbo.raast_thirdparty_records rtr
    WHERE
        rtr.response_code = '00'
        AND rtr.aggregator_code = '00087'
        AND CAST(rtr.created_on AS DATE) BETWEEN @last30_start AND @end_date
  `);
  console.log(`        Query duration: ${summary.durationMs}ms`);
  console.log(`        Rows returned: ${summary.rowCount}`);
  for (const row of summary.rows) {
    for (const [k, v] of Object.entries(row)) {
      console.log(`          ${k}: ${String(v)}`);
    }
  }

  await db.close();

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  RESULT: ✓ DB CONNECTIVITY VERIFIED');
  console.log('══════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\n✗ DB VERIFICATION FAILED:', err.message ?? err);
  process.exit(1);
});
