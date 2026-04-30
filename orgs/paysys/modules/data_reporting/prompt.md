# Data Reporting Module — NBP RAAST Reporting Rules & SQL Catalog

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

### raast_thirdparty_records — Key Columns
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT | Primary key |
| `merchant_id` | INT | FK to merchant.id |
| `tid` | VARCHAR | Terminal ID (string) |
| `amount` | DECIMAL | Transaction amount (PKR) |
| `response_code` | VARCHAR | '00' = successful |
| `aggregator_code` | VARCHAR | NBP = '00087' |
| `created_on` | DATETIME | Transaction timestamp — use for date filters |
| `status` | VARCHAR | Transaction status |

### terminal — Key Columns
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT | PK |
| `tid` | VARCHAR | Terminal identifier |
| `merchant_id` | INT | FK to merchant |
| `status` | VARCHAR | 'active' / 'inactive' |
| `terminal_type` | INT | Exclude type=2 (soft-POS) where applicable |
| `created_at` | DATETIME | Registration date |

### merchant — Key Columns
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT | PK (= merchant_id) |
| `name` | VARCHAR | Merchant name |
| `status` | VARCHAR | 'active' / 'inactive' |
| `created_at` | DATETIME | Onboarding date |

> Note: Region lookup (city/region tables) may be joined if KYC data is available.
> If joins fail or return null, treat region as 'Unknown'. Never break the query for missing KYC.

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
    rtr.merchant_id                      AS MerchantID,
    m.name                               AS MerchantName,
    COUNT(rtr.id)                        AS TxnCount,
    CAST(SUM(rtr.amount) AS DECIMAL(18,2)) AS TotalVolume,
    COUNT(DISTINCT rtr.tid)              AS UniqueTIDs,
    MAX(CAST(rtr.created_on AS DATE))    AS LastTxnDate
FROM OPENMMS.dbo.raast_thirdparty_records rtr
LEFT JOIN OPENMMS.dbo.merchant m ON m.id = rtr.merchant_id
WHERE
    rtr.response_code = '00'
    AND rtr.aggregator_code = '00087'
    AND CAST(rtr.created_on AS DATE) BETWEEN @start_date AND @end_date
GROUP BY rtr.merchant_id, m.name
ORDER BY TotalVolume DESC
```

### 3. Single Merchant Summary (by merchant_id or merchant name)

```sql
DECLARE @start_date DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
DECLARE @end_date   DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)

SELECT
    rtr.merchant_id                        AS MerchantID,
    m.name                                 AS MerchantName,
    rtr.tid                                AS TID,
    COUNT(rtr.id)                          AS TxnCount,
    CAST(SUM(rtr.amount) AS DECIMAL(18,2)) AS TotalVolume,
    MIN(CAST(rtr.created_on AS DATE))      AS FirstTxnDate,
    MAX(CAST(rtr.created_on AS DATE))      AS LastTxnDate
FROM OPENMMS.dbo.raast_thirdparty_records rtr
LEFT JOIN OPENMMS.dbo.merchant m ON m.id = rtr.merchant_id
WHERE
    rtr.response_code = '00'
    AND rtr.aggregator_code = '00087'
    AND CAST(rtr.created_on AS DATE) BETWEEN @start_date AND @end_date
    /* MERCHANT FILTER: AND rtr.merchant_id = <ID>  OR  AND m.name LIKE '%<name>%' */
GROUP BY rtr.merchant_id, m.name, rtr.tid
ORDER BY TotalVolume DESC
```

### 4. Single Terminal Summary (by TID)

```sql
DECLARE @start_date DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
DECLARE @end_date   DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)

SELECT
    rtr.tid                                AS TID,
    rtr.merchant_id                        AS MerchantID,
    m.name                                 AS MerchantName,
    COUNT(rtr.id)                          AS TxnCount,
    CAST(SUM(rtr.amount) AS DECIMAL(18,2)) AS TotalVolume,
    MIN(CAST(rtr.created_on AS DATE))      AS FirstTxnDate,
    MAX(CAST(rtr.created_on AS DATE))      AS LastTxnDate
FROM OPENMMS.dbo.raast_thirdparty_records rtr
LEFT JOIN OPENMMS.dbo.merchant m ON m.id = rtr.merchant_id
WHERE
    rtr.response_code = '00'
    AND rtr.aggregator_code = '00087'
    AND rtr.tid = '/* TID HERE */'
    AND CAST(rtr.created_on AS DATE) BETWEEN @start_date AND @end_date
GROUP BY rtr.tid, rtr.merchant_id, m.name
```

### 6. Full NBP Business Stats Dashboard (Regional + Top Merchants)
Use this query when user asks for: "full NBP stats", "business report", "poora NBP ka data", "regional breakdown", "NBP ka full dashboard", "NBP TAPSYS QR ON POS report", or any request mentioning regions (North/Central/South/Islamabad).

This query returns two RowType values:
- `SUMMARY` rows: one per region + one TOTAL row — contains regional transaction and merchant stats
- `MERCHANT` rows: top 10 merchants by MTD volume

When rendering, use `reportTitle = 'NBP TAPSYS QR ON POS'` and `renderType = 'table'`.

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
    Region, [Merchant Name];
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
| `nbp_full_business_dashboard` (Query 6) | `full_dashboard` | Rows have RowType='SUMMARY'+'MERCHANT' |
| `top_10_merchants` (Query 2) | `top_merchants` | Ranked list by volume |
| `active_merchants_terminals` (Query 5) | `metric_card` | Single-row KPI metrics |
| `nbp_summary_dashboard` (Query 1) | `metric_card` | Single-row multi-column KPIs |
| `single_merchant` (Query 3) | `merchant_summary` | One merchant, per-TID breakdown |
| `single_terminal` (Query 4) | `terminal_summary` | Single TID stats |
| Regional filter on Query 6 | `region_summary` | Subset of SUMMARY rows for one region |
| Any other multi-row tabular result | `comparison_table` | Generic table fallback |
| No rows returned | `no_data` | Auto-detected by renderer if rows=[] |

---

## LLM Planning Brain — Required JSON Output Structure

Before executing any report, output a structured JSON plan (inside a tool call or as the first reasoning step). The backend validates this plan before executing SQL or rendering.

```json
{
  "intent": "nbp_full_business_dashboard",
  "needs_sql": true,
  "confidence": "high",
  "report_type": "full_dashboard",
  "render_type": "full_dashboard",
  "filters": {
    "aggregator_code": "00087",
    "response_code": "00"
  },
  "date_range": {
    "label": "Yesterday + MTD",
    "yesterday": "DATEADD(DAY,-1,GETDATE())",
    "mtd_start": "DATEFROMPARTS(YEAR(GETDATE()),MONTH(GETDATE()),1)"
  },
  "sql": "/* full T-SQL query here */",
  "render_config": {
    "layout": "full_dashboard",
    "sections": ["kpi_cards", "region_table", "top_merchants_table"],
    "columns": {
      "summary": ["Region","Total Merchants","Total Terminals","Active Merchants (30d)","Active Terminals (30d)","Sale Volume Yesterday","Yesterday Count","Sale Volume MTD","MTD Count"],
      "merchants": ["Merchant Name","Merchant Txn Count","Merchant Txn Amount"]
    },
    "title": "NBP TAPSYS QR ON POS",
    "highlight_total_row": true
  },
  "caption": "NBP TAPSYS QR ON POS — Yesterday + MTD",
  "clarification_required": false
}
```

### Field definitions

| Field | Required | Description |
|---|---|---|
| `intent` | yes | One of the intent keys from the mapping table above |
| `needs_sql` | yes | `true` for data reports; `false` for status/help commands |
| `confidence` | yes | `"high"` / `"medium"` / `"low"` — if low, set `clarification_required=true` |
| `report_type` | yes | Human-readable report category |
| `render_type` | yes | One of the 8 render types from the table above |
| `filters` | yes | Active WHERE clause filters (always include aggregator_code + response_code) |
| `date_range` | yes | Label + SQL expressions for start/end dates |
| `sql` | yes | Complete T-SQL query (DECLARE vars at top, no hardcoded dates) |
| `render_config.layout` | yes | Must match `render_type` |
| `render_config.sections` | yes | Which visual sections to show |
| `render_config.columns` | yes | Column names to display per section |
| `render_config.title` | yes | Report header title |
| `caption` | yes | Short WhatsApp message caption accompanying the image |
| `clarification_required` | yes | `true` → ask ONE clarifying question before executing |

### Planning workflow (always follow this order)

1. Load memory (`data_reporting.get_memory`)
2. Detect intent from user message
3. Determine `render_type` using the selection table above
4. Determine date range (parse Urdu/Roman Urdu date expressions)
5. Generate `sql` using the catalog query as base (substitute correct DECLARE dates)
6. Build `render_config` (columns, title, sections)
7. Set `clarification_required=true` if intent confidence is low
8. If `clarification_required=false` → call `data_reporting.execute_sql` with the `sql`
9. Call `data_reporting.render_report` with rows + `render_type` + `render_config`
10. Your ENTIRE final text response after render_report MUST be ONLY this JSON (nothing else — no greeting, no explanation, no text before or after the JSON):

```json
{"type":"image","imagePath":"<imagePath from render_report result>","caption":"<your follow-up message>"}
```

Example:
```json
{"type":"image","imagePath":"output/reports/report_1777533630085.png","caption":"NBP QR ON POS — Top 2 Merchants (All Time)\n\nYe report theek hai? Koi correction chahiye ya koi aur report?"}
```

- `imagePath`: copy the exact value returned by `render_report` tool result
- `caption`: your conversational follow-up (include the "Ye report theek hai?" line here)

For non-image responses (clarification, greeting, error), your final response MUST be:
```json
{"type":"text","message":"your message here"}
```
