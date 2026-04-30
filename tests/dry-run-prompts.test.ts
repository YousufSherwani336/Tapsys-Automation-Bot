/**
 * Dry-run prompt simulation tests.
 *
 * These tests simulate the SQL that the LLM agent would generate for each
 * user prompt, validate it through the SQL safety validator, and confirm the
 * date parser resolves intent correctly.
 *
 * They do NOT hit the real DB or WhatsApp — pure offline validation.
 */

import { describe, it, expect } from 'vitest';
import { validateSql } from '../src/shared-modules/data-reporting/lib/sqlValidator.js';
import { parseDateRange } from '../src/shared-modules/data-reporting/lib/dateParser.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build representative NBP queries (what the LLM agent would emit)
// ─────────────────────────────────────────────────────────────────────────────

function nbpSummaryQuery(period: 'yesterday' | 'mtd' = 'yesterday'): string {
  const dateDecl =
    period === 'yesterday'
      ? `DECLARE @start_date   DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
DECLARE @end_date     DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
DECLARE @mtd_start    DATE = CAST(DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1) AS DATE)
DECLARE @last30_start DATE = CAST(DATEADD(DAY, -30, GETDATE()) AS DATE)`
      : `DECLARE @start_date   DATE = CAST(DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1) AS DATE)
DECLARE @end_date     DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
DECLARE @mtd_start    DATE = CAST(DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1) AS DATE)
DECLARE @last30_start DATE = CAST(DATEADD(DAY, -30, GETDATE()) AS DATE)`;

  return `${dateDecl}
SELECT
    COUNT(CASE WHEN CAST(rtr.created_on AS DATE) = @start_date THEN 1 END) AS YesterdayCount,
    ISNULL(SUM(CASE WHEN CAST(rtr.created_on AS DATE) = @start_date THEN rtr.amount END), 0) AS YesterdayVolume,
    COUNT(CASE WHEN CAST(rtr.created_on AS DATE) BETWEEN @mtd_start AND @end_date THEN 1 END) AS MTDCount,
    ISNULL(SUM(CASE WHEN CAST(rtr.created_on AS DATE) BETWEEN @mtd_start AND @end_date THEN rtr.amount END), 0) AS MTDVolume
FROM OPENMMS.dbo.raast_thirdparty_records rtr
WHERE rtr.response_code = '00'
  AND rtr.aggregator_code = '00087'
  AND CAST(rtr.created_on AS DATE) BETWEEN @last30_start AND @end_date`;
}

function top10MerchantsQuery(): string {
  return `DECLARE @start_date DATE = CAST(DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1) AS DATE)
DECLARE @end_date   DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
SELECT TOP 10
    rtr.merchant_id AS MerchantID,
    m.name AS MerchantName,
    COUNT(rtr.id) AS TxnCount,
    CAST(SUM(rtr.amount) AS DECIMAL(18,2)) AS TotalVolume
FROM OPENMMS.dbo.raast_thirdparty_records rtr
LEFT JOIN OPENMMS.dbo.merchant m ON m.id = rtr.merchant_id
WHERE rtr.response_code = '00'
  AND rtr.aggregator_code = '00087'
  AND CAST(rtr.created_on AS DATE) BETWEEN @start_date AND @end_date
GROUP BY rtr.merchant_id, m.name
ORDER BY TotalVolume DESC`;
}

function singleMerchantQuery(merchantId: number): string {
  return `DECLARE @start_date DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
DECLARE @end_date   DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
SELECT
    rtr.merchant_id AS MerchantID,
    m.name AS MerchantName,
    rtr.tid AS TID,
    COUNT(rtr.id) AS TxnCount,
    CAST(SUM(rtr.amount) AS DECIMAL(18,2)) AS TotalVolume
FROM OPENMMS.dbo.raast_thirdparty_records rtr
LEFT JOIN OPENMMS.dbo.merchant m ON m.id = rtr.merchant_id
WHERE rtr.response_code = '00'
  AND rtr.aggregator_code = '00087'
  AND rtr.merchant_id = ${merchantId}
  AND CAST(rtr.created_on AS DATE) BETWEEN @start_date AND @end_date
GROUP BY rtr.merchant_id, m.name, rtr.tid`;
}

function singleTidQuery(tid: string): string {
  return `DECLARE @start_date DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
DECLARE @end_date   DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
SELECT
    rtr.tid AS TID,
    rtr.merchant_id AS MerchantID,
    m.name AS MerchantName,
    COUNT(rtr.id) AS TxnCount,
    CAST(SUM(rtr.amount) AS DECIMAL(18,2)) AS TotalVolume
FROM OPENMMS.dbo.raast_thirdparty_records rtr
LEFT JOIN OPENMMS.dbo.merchant m ON m.id = rtr.merchant_id
WHERE rtr.response_code = '00'
  AND rtr.aggregator_code = '00087'
  AND rtr.tid = '${tid}'
  AND CAST(rtr.created_on AS DATE) BETWEEN @start_date AND @end_date
GROUP BY rtr.tid, rtr.merchant_id, m.name`;
}

function activeMerchantsQuery(): string {
  return `DECLARE @last30_start DATE = CAST(DATEADD(DAY, -30, GETDATE()) AS DATE)
DECLARE @end_date     DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
SELECT
    COUNT(DISTINCT rtr.merchant_id) AS ActiveMerchants,
    COUNT(DISTINCT rtr.tid) AS ActiveTerminals,
    COUNT(rtr.id) AS TotalTransactions,
    CAST(SUM(rtr.amount) AS DECIMAL(18,2)) AS TotalVolume
FROM OPENMMS.dbo.raast_thirdparty_records rtr
WHERE rtr.response_code = '00'
  AND rtr.aggregator_code = '00087'
  AND CAST(rtr.created_on AS DATE) BETWEEN @last30_start AND @end_date`;
}

// ─────────────────────────────────────────────────────────────────────────────
// POSITIVE PROMPT TESTS (14 scenarios)
// ─────────────────────────────────────────────────────────────────────────────

describe('Positive prompt simulations — SQL validation passes', () => {
  it('P1: "NBP ka dashboard bhejo" → NBP summary, yesterday', () => {
    const sql = nbpSummaryQuery('yesterday');
    const result = validateSql(sql);
    expect(result.valid).toBe(true);
    expect(sql).toContain('raast_thirdparty_records');
    expect(sql).toContain("aggregator_code = '00087'");
    expect(sql).toContain("response_code = '00'");
  });

  it('P2: "kal ka NBP summary" → NBP summary, yesterday', () => {
    const sql = nbpSummaryQuery('yesterday');
    expect(validateSql(sql).valid).toBe(true);
  });

  it('P3: "MTD volume batao" → NBP summary, MTD date range', () => {
    const sql = nbpSummaryQuery('mtd');
    expect(validateSql(sql).valid).toBe(true);
    expect(sql).toContain('DATEFROMPARTS');
  });

  it('P4: "top 10 merchants MTD" → top 10 merchants query', () => {
    const sql = top10MerchantsQuery();
    expect(validateSql(sql).valid).toBe(true);
    expect(sql).toContain('TOP 10');
    expect(sql).toContain('ORDER BY TotalVolume DESC');
  });

  it('P5: "merchant 12345 ka data" → single merchant by MID', () => {
    const sql = singleMerchantQuery(12345);
    expect(validateSql(sql).valid).toBe(true);
    expect(sql).toContain('merchant_id = 12345');
  });

  it('P6: "MID 99 ka data" → single merchant by numeric ID', () => {
    expect(validateSql(singleMerchantQuery(99)).valid).toBe(true);
  });

  it('P7: "TID T001 ka data" → single terminal by TID', () => {
    const sql = singleTidQuery('T001');
    expect(validateSql(sql).valid).toBe(true);
    expect(sql).toContain("rtr.tid = 'T001'");
  });

  it('P8: "last 30 days active merchants" → active merchants dashboard', () => {
    const sql = activeMerchantsQuery();
    expect(validateSql(sql).valid).toBe(true);
    expect(sql).toContain('COUNT(DISTINCT rtr.merchant_id)');
    expect(sql).toContain('COUNT(DISTINCT rtr.tid)');
  });

  it('P9: "active terminal percentage" → active merchants/terminals query', () => {
    expect(validateSql(activeMerchantsQuery()).valid).toBe(true);
  });

  it('P10: DECLARE date variables are always present in all NBP queries', () => {
    const queries = [
      nbpSummaryQuery('yesterday'),
      top10MerchantsQuery(),
      singleMerchantQuery(1),
      singleTidQuery('ABC'),
      activeMerchantsQuery(),
    ];
    for (const sql of queries) {
      expect(sql).toContain('DECLARE');
      expect(validateSql(sql).valid).toBe(true);
    }
  });

  it('P11: Date parser — "kal" resolves to yesterday type', () => {
    const range = parseDateRange('kal');
    expect(range.type).toBe('yesterday');
    expect(range.startDate).toBe(range.endDate);
  });

  it('P12: Date parser — "MTD" resolves to mtd type with 1st-of-month start', () => {
    const range = parseDateRange('MTD');
    expect(range.type).toBe('mtd');
    expect(range.startDate.endsWith('-01')).toBe(true);
  });

  it('P13: Date parser — "last 30 days" resolves correct window (29-day diff)', () => {
    const range = parseDateRange('last 30 days');
    expect(range.type).toBe('last_30_days');
    const start = new Date(range.startDate);
    const end = new Date(range.endDate);
    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(29);
  });

  it('P14: All NBP queries use LEFT JOIN, not INNER JOIN', () => {
    const queries = [
      top10MerchantsQuery(),
      singleMerchantQuery(1),
      singleTidQuery('X'),
    ];
    for (const sql of queries) {
      expect(sql.toUpperCase()).toContain('LEFT JOIN');
      expect(sql.toUpperCase()).not.toContain('INNER JOIN');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NEGATIVE / SECURITY TESTS (8 scenarios)
// ─────────────────────────────────────────────────────────────────────────────

describe('Negative / security prompt simulations — SQL validation blocks', () => {
  it('S1: DROP TABLE attempt is blocked', () => {
    const result = validateSql('DROP TABLE OPENMMS.dbo.raast_thirdparty_records');
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/DROP/i);
  });

  it('S2: DELETE attempt is blocked', () => {
    const result = validateSql(
      `DELETE FROM OPENMMS.dbo.raast_thirdparty_records WHERE merchant_id = 1`,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/DELETE/i);
  });

  it('S3: UPDATE attempt is blocked', () => {
    const result = validateSql(
      `UPDATE OPENMMS.dbo.merchant SET status = 'inactive' WHERE id = 1`,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/UPDATE/i);
  });

  it('S4: INSERT attempt is blocked', () => {
    const result = validateSql(
      `INSERT INTO OPENMMS.dbo.merchant (name, status) VALUES ('evil', 'active')`,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/INSERT/i);
  });

  it('S5: xp_cmdshell stacked after SELECT is blocked', () => {
    // Semicolons in SELECT body trigger the stacked-statement guard
    const result = validateSql(
      `SELECT 1 AS ping; EXEC xp_cmdshell 'whoami'`,
    );
    expect(result.valid).toBe(false);
  });

  it('S6: TRUNCATE attempt is blocked', () => {
    const result = validateSql(`TRUNCATE TABLE OPENMMS.dbo.raast_thirdparty_records`);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/TRUNCATE/i);
  });

  it('S7: ALTER TABLE attempt is blocked', () => {
    const result = validateSql(
      `ALTER TABLE OPENMMS.dbo.merchant ADD hacked_column VARCHAR(255)`,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/ALTER/i);
  });

  it('S8: EXEC / EXECUTE stored procedure is blocked', () => {
    const result = validateSql(`EXECUTE sp_configure 'show advanced options', 1`);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/EXEC|sp_configure/i);
  });
});
