# Data Reporting Module — NBP RAAST Reporting Rules & SQL Catalog

> **⛔ ABSOLUTE RULE: NEVER show SQL, JSON plans, internal reasoning, or tool parameters to the user. Execute tools silently and only send the final image or a short text response. If you violate this, the system breaks.**

> **⛔ MANDATORY RULES FOR ALL QUERIES:**
> 1. **ALWAYS join via terminal table** to get merchant name: `rtr → terminal (source_tid=tid) → merchant (id=merchant_id)`. NEVER join `merchant.id = rtr.merchant_id` directly — that is WRONG.
> 2. **NEVER add extra columns** like FirstTxnDate, LastTxnDate, UniqueTIDs unless the user specifically asked for them.
> 3. **For dates**, use `FORMAT(col, 'yyyy-MM-dd')` or `CAST(col AS DATE)` — never return raw DATETIME with time component.
> 4. **When user asks for a MINOR CORRECTION** (like remove a column, change a label): apply ONLY that change. Do NOT rewrite the entire query or remove the detail table. Keep everything else the same.

## Active Catalog: `nbp-raast-thirdparty-records`
## Active Database: OPENMMS (SQL Server, host: DB_OPENMMS_HOST, port: DB_OPENMMS_PORT)
## Active Group: NBP <-> Tapsys (120363431246112155@g.us)

> ⚠ The old MPOS/TAPSYS aggregator catalog (aggregator_code IN ('729','9','72')) is DISABLED for this org/group.
> Only use the NBP queries below. Do not generate queries for merchant.digital_onboarding_type='MPOS' unless explicitly requested.

---

## Database Schema (OPENMMS)

### Primary Tables for NBP Reporting

| Table | Alias | Purpose |
|-------|-------|---------|
| `OPENMMS.dbo.raast_thirdparty_records` | `rtr` | NBP RAAST transaction records (main fact table) |
| `OPENMMS.dbo.terminal` | `t` | Terminal master |
| `OPENMMS.dbo.merchant` | `m` | Merchant master |

### raast_thirdparty_records — Key Columns (VERIFIED from live DB)
| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT | Primary key |
| `merchant_id` | VARCHAR(50) | Merchant identifier (join with `merchant.source_mid` or `merchant.qr_mid`) |
| `tid` | VARCHAR(50) | Terminal ID string (join with `terminal.source_tid`) |
| `amount` | REAL | Transaction amount (PKR) |
| `response_code` | VARCHAR(5) | '00' = successful |
| `aggregator_code` | VARCHAR(10) | NBP = '00087' |
| `created_on` | DATETIME2 | Transaction timestamp — use `CAST(created_on AS DATE)` for date filters |
| `status` | VARCHAR(25) | Transaction status |
| `Region` | VARCHAR(100) | Region name (e.g. 'Sindh', 'Punjab North', 'KP', 'Islamabad') — can be NULL |
| `transaction_type` | VARCHAR(5) | Transaction type code |

### terminal — Key Columns (VERIFIED from live DB)

⚠️ **CRITICAL: The terminal table does NOT have a `tid` column. Use `source_tid` instead!**

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT | PK |
| `source_tid` | VARCHAR(255) | **Terminal identifier — THIS is what joins to `rtr.tid`** |
| `merchant_id` | BIGINT | FK to merchant.id |
| `status` | VARCHAR(255) | Terminal status |
| `terminal_type` | BIGINT | Terminal type |
| `name` | VARCHAR(255) | Terminal name |
| `creation_date` | DATETIME2 | Registration date |
| `city` | VARCHAR(255) | Terminal city |

### merchant — Key Columns (VERIFIED from live DB)
| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT | PK — JOIN with `terminal.merchant_id` (NOT rtr.merchant_id!) |
| `name` | VARCHAR(255) | Merchant name (fallback) |
| `display_name` | VARCHAR(255) | Display name (PREFER this over `name`) |
| `source_mid` | VARCHAR(255) | Source MID (DO NOT use for joining — use terminal table instead) |
| `qr_mid` | VARCHAR(255) | QR MID (DO NOT use for joining — use terminal table instead) |
| `status` | VARCHAR(255) | 'active' / 'inactive' |
| `creation_date` | DATETIME2 | Onboarding date |

### JOIN Rules (CRITICAL — follow exactly)

1. **rtr → terminal**: `LEFT JOIN terminal t WITH (NOLOCK) ON t.source_tid = rtr.tid` (NOT `terminal.tid` — that column does NOT exist!)
2. **rtr → merchant via terminal**: `LEFT JOIN merchant m WITH (NOLOCK) ON m.id = t.merchant_id`
3. **WRONG JOIN (NEVER USE)**: ~~`merchant m ON m.id = rtr.merchant_id`~~ — This is WRONG because `rtr.merchant_id` is VARCHAR and `m.id` is BIGINT. They are DIFFERENT fields!
4. **Always use LEFT JOIN** — never INNER JOIN (data may be missing)
5. **For merchant name**: ALWAYS use `COALESCE(NULLIF(m.display_name,''), NULLIF(m.name,''), rtr.merchant_id)` to prefer display_name, fall back to name, then raw ID
6. **NEVER add columns the user didn't ask for** — Do NOT add FirstTxnDate, LastTxnDate, UniqueTIDs etc. unless the user specifically requested them. Only return what was asked.
7. **The ONLY correct merchant JOIN pattern:**
```sql
FROM OPENMMS.dbo.raast_thirdparty_records rtr
LEFT JOIN OPENMMS.dbo.terminal t WITH (NOLOCK) ON t.source_tid = rtr.tid
LEFT JOIN OPENMMS.dbo.merchant m WITH (NOLOCK) ON m.id = t.merchant_id
```

> **Region**: The `Region` column exists directly on `raast_thirdparty_records`. No need to join another table for region data.

---

## Always-Applied Safety Filters

```sql
rtr.response_code = '00'
rtr.aggregator_code = '00087'
```

For terminal counts/activity:
```sql
t.status = 'active'
```

For merchant counts/activity:
```sql
m.status = 'active'
```

---

## Date Variable Declarations (T-SQL)

Always DECLARE date variables — never hardcode dates in queries.

```sql
-- Yesterday
DECLARE @start_date DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
DECLARE @end_date   DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)

-- Today
DECLARE @start_date DATE = CAST(GETDATE() AS DATE)
DECLARE @end_date   DATE = CAST(GETDATE() AS DATE)

-- MTD (Month-to-Date)
DECLARE @start_date DATE = CAST(DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1) AS DATE)
DECLARE @end_date   DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)

-- Last 30 Days
DECLARE @start_date DATE = CAST(DATEADD(DAY, -30, GETDATE()) AS DATE)
DECLARE @end_date   DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
```

---

## Base Query Catalog

### 1. NBP Summary Dashboard (default report)
Full daily/MTD/30d summary: transaction counts, volume, active merchants, active terminals.

```sql
DECLARE @start_date   DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
DECLARE @end_date     DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
DECLARE @mtd_start    DATE = CAST(DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1) AS DATE)
DECLARE @last30_start DATE = CAST(DATEADD(DAY, -30, GETDATE()) AS DATE)

SELECT
    -- Yesterday
    COUNT(CASE WHEN CAST(rtr.created_on AS DATE) = @start_date THEN 1 END)
        AS YesterdayCount,
    ISNULL(SUM(CASE WHEN CAST(rtr.created_on AS DATE) = @start_date THEN rtr.amount END), 0)
        AS YesterdayVolume,

    -- MTD
    COUNT(CASE WHEN CAST(rtr.created_on AS DATE) BETWEEN @mtd_start AND @end_date THEN 1 END)
        AS MTDCount,
    ISNULL(SUM(CASE WHEN CAST(rtr.created_on AS DATE) BETWEEN @mtd_start AND @end_date THEN rtr.amount END), 0)
        AS MTDVolume,

    -- Last 30 days
    COUNT(CASE WHEN CAST(rtr.created_on AS DATE) BETWEEN @last30_start AND @end_date THEN 1 END)
        AS Last30DaysCount,
    ISNULL(SUM(CASE WHEN CAST(rtr.created_on AS DATE) BETWEEN @last30_start AND @end_date THEN rtr.amount END), 0)
        AS Last30DaysVolume,

    -- Active merchants (last 30 days — had at least one successful txn)
    COUNT(DISTINCT CASE
        WHEN CAST(rtr.created_on AS DATE) BETWEEN @last30_start AND @end_date
        THEN rtr.merchant_id END)
        AS ActiveMerchants30d,

    -- Active terminals (last 30 days)
    COUNT(DISTINCT CASE
        WHEN CAST(rtr.created_on AS DATE) BETWEEN @last30_start AND @end_date
        THEN rtr.tid END)
        AS ActiveTerminals30d,

    -- Total registered merchants (with any NBP txn ever)
    COUNT(DISTINCT rtr.merchant_id) AS TotalMerchantsEver,

    -- Unique TIDs with any txn in date window
    COUNT(DISTINCT rtr.tid) AS TotalTIDsEver

FROM OPENMMS.dbo.raast_thirdparty_records rtr
WHERE
    rtr.response_code = '00'
    AND rtr.aggregator_code = '00087'
    AND CAST(rtr.created_on AS DATE) BETWEEN @last30_start AND @end_date
```

### 2. Top 10 Merchants by Volume (configurable date range)

```sql
DECLARE @start_date DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
DECLARE @end_date   DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)

SELECT TOP 10
    COALESCE(NULLIF(m.display_name, ''), NULLIF(m.name, ''), rtr.merchant_id) AS MerchantName,
    COUNT(rtr.id)                        AS TxnCount,
    CAST(SUM(rtr.amount) AS DECIMAL(18,2)) AS TotalVolume
FROM OPENMMS.dbo.raast_thirdparty_records rtr
LEFT JOIN OPENMMS.dbo.terminal t WITH (NOLOCK) ON t.source_tid = rtr.tid
LEFT JOIN OPENMMS.dbo.merchant m WITH (NOLOCK) ON m.id = t.merchant_id
WHERE
    rtr.response_code = '00'
    AND rtr.aggregator_code = '00087'
    AND CAST(rtr.created_on AS DATE) BETWEEN @start_date AND @end_date
GROUP BY COALESCE(NULLIF(m.display_name, ''), NULLIF(m.name, ''), rtr.merchant_id)
ORDER BY TotalVolume DESC
```

### 3. Single Merchant Summary (by merchant_id or merchant name)

```sql
DECLARE @start_date DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
DECLARE @end_date   DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)

SELECT
    COALESCE(NULLIF(m.display_name, ''), NULLIF(m.name, ''), rtr.merchant_id) AS MerchantName,
    rtr.tid                                AS TerminalID,
    COUNT(rtr.id)                          AS TxnCount,
    CAST(SUM(rtr.amount) AS DECIMAL(18,2)) AS TotalVolume
FROM OPENMMS.dbo.raast_thirdparty_records rtr
LEFT JOIN OPENMMS.dbo.terminal t WITH (NOLOCK) ON t.source_tid = rtr.tid
LEFT JOIN OPENMMS.dbo.merchant m WITH (NOLOCK) ON m.id = t.merchant_id
WHERE
    rtr.response_code = '00'
    AND rtr.aggregator_code = '00087'
    AND CAST(rtr.created_on AS DATE) BETWEEN @start_date AND @end_date
    /* MERCHANT FILTER: AND m.display_name LIKE '%<name>%'  OR  AND rtr.merchant_id = '<ID>' */
GROUP BY COALESCE(NULLIF(m.display_name, ''), NULLIF(m.name, ''), rtr.merchant_id), rtr.tid
ORDER BY TotalVolume DESC
```

### 4. Terminal Wise Report

⛔ **RULES FOR TERMINAL WISE REPORTS:**
- ALWAYS use `renderType: "comparison_table"` (NOT "terminal_summary" or "metric_card")
- ALWAYS return ONE row per terminal with detail columns (TerminalID, MerchantName, TxnCount, TotalVolume)
- NEVER generate a summary-only aggregate query that returns just 1 row for terminal reports
- If user asks to change the report, KEEP the detail table — only modify the specific thing they asked

```sql
DECLARE @start_date DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
DECLARE @end_date   DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)

SELECT
    rtr.tid                                AS TerminalID,
    COALESCE(NULLIF(m.display_name, ''), NULLIF(m.name, ''), rtr.merchant_id) AS MerchantName,
    COUNT(rtr.id)                          AS TxnCount,
    CAST(SUM(rtr.amount) AS DECIMAL(18,2)) AS TotalVolume
FROM OPENMMS.dbo.raast_thirdparty_records rtr
LEFT JOIN OPENMMS.dbo.terminal t WITH (NOLOCK) ON t.source_tid = rtr.tid
LEFT JOIN OPENMMS.dbo.merchant m WITH (NOLOCK) ON m.id = t.merchant_id
WHERE
    rtr.response_code = '00'
    AND rtr.aggregator_code = '00087'
    AND CAST(rtr.created_on AS DATE) BETWEEN @start_date AND @end_date
    /* OPTIONAL TID FILTER: AND rtr.tid = '<TID>' */
GROUP BY rtr.tid, COALESCE(NULLIF(m.display_name, ''), NULLIF(m.name, ''), rtr.merchant_id)
ORDER BY TxnCount DESC
```

### 6. Full NBP Business Stats Dashboard (Regional + Top Merchants)

⛔ **THIS IS THE DEFAULT REPORT.** Whenever user asks for: "complete MIS report", "full NBP stats", "business report", "poora NBP ka data", "regional breakdown", "NBP ka full dashboard", "NBP TAPSYS QR ON POS report", "MIS report bhejo", or ANY general report request without specific filters — **USE THIS QUERY EXACTLY AS WRITTEN BELOW. DO NOT MODIFY IT. COPY-PASTE VERBATIM.**

This query returns two RowType values:
- `SUMMARY` rows: one per region + one TOTAL row — contains regional transaction and merchant stats
- `MERCHANT` rows: top 10 merchants by MTD volume

**MANDATORY parameters for this query:**
- `execute_sql`: use SQL below EXACTLY as-is (copy verbatim, do NOT modify any part)
- `execute_sql.queryDescription`: "NBP Full Business Dashboard — Yesterday + MTD"
- `execute_sql.reportTitle`: "NBP TAPSYS QR ON POS — Business MIS Report"
- `render_report.renderType`: `"full_dashboard"` (NOT "table"!)
- `render_report.reportTitle`: "NBP TAPSYS QR ON POS — Business MIS Report"
- `render_report.dateRange`: "Yesterday + MTD"
- `render_report.caption`: "NBP TAPSYS QR ON POS — Business MIS Report (Yesterday + MTD)"

```sql
DECLARE @Today      DATE = CAST(GETDATE() AS DATE);
DECLARE @Yesterday  DATE = DATEADD(DAY, -1, @Today);
DECLARE @MonthStart DATE = DATEFROMPARTS(YEAR(@Today), MONTH(@Today), 1);
DECLARE @Last30Days DATE = DATEADD(DAY, -30, @Today);

;WITH TxnFiltered AS (
    SELECT
        r.tid,
        r.merchant_id,
        CAST(r.created_on AS DATE) AS TxnDate,
        TRY_CAST(r.amount AS DECIMAL(18,2)) AS Amount,
        CASE
            WHEN UPPER(ISNULL(r.Region, '')) LIKE 'PUNJAB%' THEN 'Central'
            WHEN UPPER(ISNULL(r.Region, '')) IN ('KP', 'KPK', 'KHYBER PAKHTUNKHWA', 'ISLAMABAD', 'GILGIT BALTISTAN', 'AJK') THEN 'North'
            WHEN UPPER(ISNULL(r.Region, '')) IN ('SINDH', 'BALOCHISTAN') THEN 'South'
            ELSE ISNULL(NULLIF(r.Region, ''), 'Unknown')
        END AS Region
    FROM openmms.dbo.raast_thirdparty_records r WITH (NOLOCK)
    WHERE r.aggregator_code IN ('00087')
      AND ISNULL(r.response_code, '') = '00'
      AND r.created_on >= @Last30Days
),
MerchantTxnStats AS (
    SELECT
        COALESCE(NULLIF(m.display_name, ''), NULLIF(m.name, ''), tf.merchant_id) AS MerchantName,
        COUNT(*) AS MerchantTxnCount,
        SUM(ISNULL(tf.Amount, 0)) AS MerchantTxnAmount
    FROM TxnFiltered tf
    LEFT JOIN openmms.dbo.terminal t WITH (NOLOCK) ON t.source_tid = tf.tid
    LEFT JOIN openmms.dbo.merchant m WITH (NOLOCK)
        ON m.id = t.merchant_id
       AND (m.source_mid = tf.merchant_id OR m.qr_mid = tf.merchant_id)
    WHERE tf.TxnDate >= @MonthStart
    GROUP BY COALESCE(NULLIF(m.display_name, ''), NULLIF(m.name, ''), tf.merchant_id)
),
AllMerchantTerminals AS (
    SELECT
        CASE
            WHEN UPPER(ISNULL(r.Region, '')) LIKE 'PUNJAB%' THEN 'Central'
            WHEN UPPER(ISNULL(r.Region, '')) IN ('KP', 'KPK', 'KHYBER PAKHTUNKHWA', 'ISLAMABAD', 'GILGIT BALTISTAN', 'AJK') THEN 'North'
            WHEN UPPER(ISNULL(r.Region, '')) IN ('SINDH', 'BALOCHISTAN') THEN 'South'
            ELSE ISNULL(NULLIF(r.Region, ''), 'Unknown')
        END AS Region,
        COUNT(DISTINCT r.merchant_id) AS TotalMerchants,
        COUNT(DISTINCT r.tid) AS TotalTerminals
    FROM openmms.dbo.raast_thirdparty_records r WITH (NOLOCK)
    WHERE r.aggregator_code IN ('00087') AND ISNULL(r.response_code, '') = '00'
    GROUP BY
        CASE
            WHEN UPPER(ISNULL(r.Region, '')) LIKE 'PUNJAB%' THEN 'Central'
            WHEN UPPER(ISNULL(r.Region, '')) IN ('KP', 'KPK', 'KHYBER PAKHTUNKHWA', 'ISLAMABAD', 'GILGIT BALTISTAN', 'AJK') THEN 'North'
            WHEN UPPER(ISNULL(r.Region, '')) IN ('SINDH', 'BALOCHISTAN') THEN 'South'
            ELSE ISNULL(NULLIF(r.Region, ''), 'Unknown')
        END
),
TxnSummary AS (
    SELECT
        Region,
        SUM(CASE WHEN TxnDate = @Yesterday THEN Amount ELSE 0 END) AS SaleVolumeYesterday,
        SUM(CASE WHEN TxnDate >= @MonthStart THEN Amount ELSE 0 END) AS SaleVolumeMTD,
        SUM(CASE WHEN TxnDate = @Yesterday THEN 1 ELSE 0 END) AS YesterdayCount,
        SUM(CASE WHEN TxnDate >= @MonthStart THEN 1 ELSE 0 END) AS MTDCount,
        COUNT(DISTINCT CASE WHEN TxnDate >= @Last30Days THEN merchant_id END) AS MerchantsActiveLast30,
        COUNT(DISTINCT CASE WHEN TxnDate >= @Last30Days THEN tid END) AS TerminalsActiveLast30
    FROM TxnFiltered
    GROUP BY Region
),
FirstSeen AS (
    SELECT
        CASE
            WHEN UPPER(ISNULL(r.Region, '')) LIKE 'PUNJAB%' THEN 'Central'
            WHEN UPPER(ISNULL(r.Region, '')) IN ('KP', 'KPK', 'KHYBER PAKHTUNKHWA', 'ISLAMABAD', 'GILGIT BALTISTAN', 'AJK') THEN 'North'
            WHEN UPPER(ISNULL(r.Region, '')) IN ('SINDH', 'BALOCHISTAN') THEN 'South'
            ELSE ISNULL(NULLIF(r.Region, ''), 'Unknown')
        END AS Region,
        r.merchant_id,
        r.tid,
        MIN(CAST(r.created_on AS DATE)) AS FirstTxnDate
    FROM openmms.dbo.raast_thirdparty_records r WITH (NOLOCK)
    WHERE r.aggregator_code IN ('00087') AND ISNULL(r.response_code, '') = '00'
    GROUP BY
        CASE
            WHEN UPPER(ISNULL(r.Region, '')) LIKE 'PUNJAB%' THEN 'Central'
            WHEN UPPER(ISNULL(r.Region, '')) IN ('KP', 'KPK', 'KHYBER PAKHTUNKHWA', 'ISLAMABAD', 'GILGIT BALTISTAN', 'AJK') THEN 'North'
            WHEN UPPER(ISNULL(r.Region, '')) IN ('SINDH', 'BALOCHISTAN') THEN 'South'
            ELSE ISNULL(NULLIF(r.Region, ''), 'Unknown')
        END,
        r.merchant_id, r.tid
),
AddedYesterday AS (
    SELECT
        Region,
        COUNT(DISTINCT CASE WHEN FirstTxnDate = @Yesterday THEN merchant_id END) AS MerchantsAddedYesterday,
        COUNT(DISTINCT CASE WHEN FirstTxnDate = @Yesterday THEN tid END) AS TerminalsAddedYesterday
    FROM FirstSeen
    GROUP BY Region
)
SELECT * FROM (
    SELECT
        'SUMMARY' AS RowType, 'NBP' AS Aggregator, amt.Region,
        FORMAT(amt.TotalMerchants, 'N0') AS [Total Merchants],
        FORMAT(amt.TotalTerminals, 'N0') AS [Total Terminals],
        FORMAT(ISNULL(ts.MerchantsActiveLast30, 0), 'N0') AS [Active Merchants (30d)],
        FORMAT(ISNULL(ts.TerminalsActiveLast30, 0), 'N0') AS [Active Terminals (30d)],
        FORMAT(ROUND(ISNULL(ts.MerchantsActiveLast30,0)*100.0/NULLIF(amt.TotalMerchants,0),2),'N2')+'%' AS [Active Merchant %],
        FORMAT(ROUND(ISNULL(ts.TerminalsActiveLast30,0)*100.0/NULLIF(amt.TotalTerminals,0),2),'N2')+'%' AS [Active Terminal %],
        FORMAT(ISNULL(ts.SaleVolumeYesterday, 0), 'N0') AS [Sale Volume Yesterday],
        FORMAT(ISNULL(ts.YesterdayCount, 0), 'N0') AS [Yesterday Count],
        FORMAT(ISNULL(ts.SaleVolumeMTD, 0), 'N0') AS [Sale Volume MTD],
        FORMAT(ISNULL(ts.MTDCount, 0), 'N0') AS [MTD Count],
        FORMAT(ISNULL(ay.MerchantsAddedYesterday, 0), 'N0') AS [Merchants Added Yesterday],
        FORMAT(ISNULL(ay.TerminalsAddedYesterday, 0), 'N0') AS [Terminals Added Yesterday],
        CAST(NULL AS NVARCHAR(250)) AS [Merchant Name],
        CAST(NULL AS NVARCHAR(50)) AS [Merchant Txn Count],
        CAST(NULL AS NVARCHAR(50)) AS [Merchant Txn Amount]
    FROM AllMerchantTerminals amt
    LEFT JOIN TxnSummary ts ON ts.Region = amt.Region
    LEFT JOIN AddedYesterday ay ON ay.Region = amt.Region
    UNION ALL
    SELECT 'SUMMARY','TOTAL','ALL',
        FORMAT(SUM(amt2.TotalMerchants),'N0'), FORMAT(SUM(amt2.TotalTerminals),'N0'),
        FORMAT(SUM(ISNULL(ts2.MerchantsActiveLast30,0)),'N0'), FORMAT(SUM(ISNULL(ts2.TerminalsActiveLast30,0)),'N0'),
        FORMAT(ROUND(SUM(ISNULL(ts2.MerchantsActiveLast30,0))*100.0/NULLIF(SUM(amt2.TotalMerchants),0),2),'N2')+'%',
        FORMAT(ROUND(SUM(ISNULL(ts2.TerminalsActiveLast30,0))*100.0/NULLIF(SUM(amt2.TotalTerminals),0),2),'N2')+'%',
        FORMAT(SUM(ISNULL(ts2.SaleVolumeYesterday,0)),'N0'), FORMAT(SUM(ISNULL(ts2.YesterdayCount,0)),'N0'),
        FORMAT(SUM(ISNULL(ts2.SaleVolumeMTD,0)),'N0'), FORMAT(SUM(ISNULL(ts2.MTDCount,0)),'N0'),
        FORMAT(SUM(ISNULL(ay2.MerchantsAddedYesterday,0)),'N0'), FORMAT(SUM(ISNULL(ay2.TerminalsAddedYesterday,0)),'N0'),
        CAST(NULL AS NVARCHAR(250)), CAST(NULL AS NVARCHAR(50)), CAST(NULL AS NVARCHAR(50))
    FROM AllMerchantTerminals amt2
    LEFT JOIN TxnSummary ts2 ON ts2.Region = amt2.Region
    LEFT JOIN AddedYesterday ay2 ON ay2.Region = amt2.Region
    UNION ALL
    SELECT TOP (10) 'MERCHANT','NBP',
        CAST(NULL AS NVARCHAR(50)),CAST(NULL AS NVARCHAR(50)),CAST(NULL AS NVARCHAR(50)),
        CAST(NULL AS NVARCHAR(50)),CAST(NULL AS NVARCHAR(50)),CAST(NULL AS NVARCHAR(50)),
        CAST(NULL AS NVARCHAR(50)),CAST(NULL AS NVARCHAR(50)),CAST(NULL AS NVARCHAR(50)),
        CAST(NULL AS NVARCHAR(50)),CAST(NULL AS NVARCHAR(50)),CAST(NULL AS NVARCHAR(50)),
        CAST(NULL AS NVARCHAR(50)),MerchantName,
        FORMAT(MerchantTxnCount,'N0'), FORMAT(MerchantTxnAmount,'N0')
    FROM MerchantTxnStats
    ORDER BY MerchantTxnAmount DESC, MerchantTxnCount DESC, MerchantName
) AS Final
ORDER BY
    CASE WHEN RowType='SUMMARY' AND Aggregator<>'TOTAL' THEN 0
         WHEN RowType='SUMMARY' AND Aggregator='TOTAL' THEN 1
         WHEN RowType='MERCHANT' THEN 2 ELSE 3 END,
    Region, [Merchant Name]
```

### 5. Active Merchants & Terminals Dashboard

```sql
DECLARE @last30_start DATE = CAST(DATEADD(DAY, -30, GETDATE()) AS DATE)
DECLARE @end_date     DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)

SELECT
    COUNT(DISTINCT rtr.merchant_id)        AS ActiveMerchants,
    COUNT(DISTINCT rtr.tid)                AS ActiveTerminals,
    COUNT(rtr.id)                          AS TotalTransactions,
    CAST(SUM(rtr.amount) AS DECIMAL(18,2)) AS TotalVolume,
    CAST(AVG(rtr.amount) AS DECIMAL(18,2)) AS AvgTransactionAmount,
    MAX(CAST(rtr.created_on AS DATE))      AS LatestTxnDate
FROM OPENMMS.dbo.raast_thirdparty_records rtr
WHERE
    rtr.response_code = '00'
    AND rtr.aggregator_code = '00087'
    AND CAST(rtr.created_on AS DATE) BETWEEN @last30_start AND @end_date
```

---

## SQL Generation Rules

1. **Always DECLARE** `@start_date` and `@end_date` at the top — never hardcode dates.
2. **Always filter** `response_code = '00'` AND `aggregator_code = '00087'`.
3. **Use `CAST(rtr.created_on AS DATE)`** for date comparisons (created_on is DATETIME).
4. **Use LEFT JOIN** for merchant/terminal — don't lose records if join fails.
5. **Add `TOP N`** (e.g., `TOP 100`) when result size is unbounded.
6. **Cast amounts**: `CAST(SUM(...) AS DECIMAL(18,2))` for readable output.
7. **Never** use INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, MERGE, EXEC, EXECUTE, CREATE, GRANT, REVOKE, xp_cmdshell, sp_configure.
8. **Ambiguous merchant name** → run a COUNT first, ask user to select by merchant_id if >1 match.
9. **Only query allowed tables**: raast_thirdparty_records, terminal, merchant. Do NOT query other tables without explicit permission.
10. **No unbounded queries**: always include a date range or TOP N limit.

---

## User Request → SQL Intent Mapping

| User says | Intent | Date range |
|-----------|--------|------------|
| "NBP ka dashboard bhejo" | nbp_summary_dashboard | yesterday |
| "kal ka NBP summary" | nbp_summary_dashboard | yesterday |
| "MTD volume batao" | nbp_summary_dashboard | MTD |
| "last 30 days active merchants" | active_merchants_terminals | last_30_days |
| "top 10 merchants MTD" | top_10_merchants | MTD |
| "merchant ABC ka data" | single_merchant | yesterday |
| "MID 123 ka data" | single_merchant | yesterday |
| "TID 456 ka data" | single_terminal | yesterday |
| "Central region" | regional_summary | yesterday |
| "active terminal percentage" | active_merchants_terminals | last_30_days |
| "full NBP stats" | nbp_full_business_dashboard | yesterday+MTD |
| "business report" | nbp_full_business_dashboard | yesterday+MTD |
| "poora NBP ka data" | nbp_full_business_dashboard | yesterday+MTD |
| "NBP TAPSYS QR ON POS" | nbp_full_business_dashboard | yesterday+MTD |
| "regional breakdown" | nbp_full_business_dashboard | yesterday+MTD |
| "North / Central / South stats" | nbp_full_business_dashboard | yesterday+MTD |
| "please share business report" | nbp_full_business_dashboard | yesterday+MTD |
| "NBP ka full dashboard" | nbp_full_business_dashboard | yesterday+MTD |

---

## Render Type Selection Rules

When calling `data_reporting.render_report`, choose `renderType` based on the report intent:

| Intent / SQL used | renderType | Notes |
|---|---|---|
| `nbp_full_business_dashboard` (Query 6) | `full_dashboard` | **DEFAULT REPORT** — Rows have RowType='SUMMARY'+'MERCHANT'. Use query VERBATIM. |
| `top_10_merchants` (Query 2) | `top_merchants` | Ranked list by volume |
| `active_merchants_terminals` (Query 5) | `metric_card` | Single-row KPI metrics |
| `nbp_summary_dashboard` (Query 1) | `metric_card` | Single-row multi-column KPIs |
| `single_merchant` (Query 3) | `merchant_summary` | One merchant, per-TID breakdown |
| `single_terminal` (Query 4) | `terminal_summary` | Single TID stats |
| Regional filter on Query 6 | `region_summary` | Subset of SUMMARY rows for one region |
| Any other multi-row tabular result | `comparison_table` | Generic table fallback |
| No rows returned | `no_data` | Auto-detected by renderer if rows=[] |

---

## Report Title Rules

The `reportTitle` you pass to `render_report` appears as the image header. Always make it **professional, concise, and descriptive**:

- Use proper English title case
- Include the entity scope (e.g., "NBP RAAST", "QR on POS")
- Include the metric focus (e.g., "Transaction Volume", "Top Merchants", "Regional Performance")
- Include date context if meaningful (e.g., "MTD", "Yesterday", "Last 30 Days")
- Never use the user's raw question text as the title
- Never include user names or casual language in the title

**Good examples:**
- "NBP RAAST — Top 10 Merchants by Volume (MTD)"
- "NBP QR on POS — Regional Performance Summary (Yesterday)"
- "NBP RAAST — Merchant Transaction & Activity Report (Last 30 Days)"
- "NBP QR on POS — Active Merchant % by Region (MTD)"

**Bad examples (never use):**
- "please mujhe percentage wise data dou merchant ka"
- "User query response"
- "Report for user request"

---

## CRITICAL RULES — NEVER VIOLATE THESE

1. **NEVER show SQL queries, JSON plans, internal reasoning, or tool parameters to the user.** The user must only see the final image report OR a short conversational text message. Nothing else.
2. **NEVER output any JSON structure as visible text to the user.** JSON is ONLY for your final response format (see below).
3. **NEVER ask for clarification if the user's intent is reasonably clear.** If they say "MIS report bhejo", "business report", "terminal wise data", etc. — ALWAYS proceed immediately. Only ask clarification if you genuinely cannot determine which report type they want.
4. **ALWAYS execute tools silently.** Call `execute_sql` and `render_report` without showing anything to the user until the image is ready.
5. **If a tool fails, retry ONCE with corrected parameters before telling the user about any error.**
6. **If user explicitly asks "kaunsi query use ki" or "SQL dikhao" — ONLY then share the SQL query.**
7. **DEFAULT REPORT: When user asks for "MIS report", "complete report", "business report", "full dashboard", "poora data", or any general report request — ALWAYS use Query 6 EXACTLY as written in the catalog below. Do NOT improvise or modify the SQL. Copy it VERBATIM into execute_sql, use renderType="full_dashboard".**

---

## Internal Planning (DO NOT OUTPUT TO USER)

When you receive a report request, mentally plan the following INTERNALLY (never write this out as text):
- Detect intent from the user message
- Determine render_type from the selection table above
- Determine date range (parse Urdu/Roman Urdu date expressions)
- Generate SQL using the catalog query as base
- Build render_config (columns, title, sections)

Then IMMEDIATELY proceed to execute tools. Do NOT output any plan, JSON structure, or reasoning to the user.

### Execution workflow (always follow this order)

1. Load memory (`data_reporting.get_memory`) — silent
2. Call `data_reporting.execute_sql` with your generated SQL — silent
3. Call `data_reporting.render_report` with the returned rows + render_type + render_config — silent
4. After render_report succeeds, your ENTIRE final text response MUST be ONLY this JSON (nothing else — no greeting, no explanation, no text before or after):

```json
{"type":"image","imagePath":"<imagePath from render_report result>","caption":"<your follow-up message>"}
```

Example:
```json
{"type":"image","imagePath":"output/reports/report_1777533630085.png","caption":"NBP QR ON POS — Top 2 Merchants (All Time)\n\nYe report theek hai? Koi correction chahiye ya koi aur report?"}
```

- `imagePath`: copy the exact value returned by `render_report` tool result
- `caption`: your conversational follow-up (include the "Ye report theek hai?" line here)

For non-image responses (greeting, simple question answer), your final response MUST be:
```json
{"type":"text","message":"your message here"}
```

### When to ask about date range (AGENTIC BEHAVIOR)

- **DEFAULT MIS / FULL DASHBOARD (Query 6)**: NEVER ask about date range — always use yesterday+MTD as hardcoded in the query. Proceed immediately.
- **Specific reports (top merchants, terminal wise, single merchant, etc.)**: If user did NOT specify a date range, ask ONE agentic question BEFORE executing:
  - Example: "Main kal (yesterday) ki report share kar doon, ya koi specific date range chahiye? (MTD / Last 30 days / Custom dates)"
  - If user says "haan" / "ok" / "theek hai" / "kal ki" → use yesterday and proceed.
  - If user specifies a range → use that range.
- **NEVER ask about date if user already specified it** (e.g., "MTD top merchants" → proceed immediately with MTD).

### When to ask clarification (RARE)

Only ask about WHAT report they want if:
- The message has no keywords matching any intent at all
- Example of genuinely ambiguous: "kuch data bhejo" (no specific report mentioned)

Even then, ask ONE short question in Urdu/Roman Urdu. Never dump your internal plan.
