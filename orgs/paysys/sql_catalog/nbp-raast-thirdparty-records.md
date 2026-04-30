# NBP RAAST Thirdparty Records — SQL Catalog

**Catalog ID:** `nbp-raast-thirdparty-records`
**Database:** OPENMMS (SQL Server)
**Org:** paysys
**Group:** NBP <-> Tapsys (`120363431246112155@g.us`)
**Last updated:** 2026-04-29

---

## Safety Filters (always applied)

```sql
rtr.response_code = '00'          -- successful transactions only
rtr.aggregator_code = '00087'     -- NBP aggregator
```

---

## Date Variable Patterns

```sql
-- Yesterday
DECLARE @start_date DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
DECLARE @end_date   DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)

-- Today
DECLARE @start_date DATE = CAST(GETDATE() AS DATE)
DECLARE @end_date   DATE = CAST(GETDATE() AS DATE)

-- MTD (Month-to-Date, through yesterday)
DECLARE @start_date DATE = CAST(DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1) AS DATE)
DECLARE @end_date   DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)

-- Last 30 Days (through yesterday)
DECLARE @start_date DATE = CAST(DATEADD(DAY, -30, GETDATE()) AS DATE)
DECLARE @end_date   DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
```

---

## Query 1 — NBP Summary Dashboard

Full multi-period summary: yesterday counts/volume, MTD, last-30-day, active merchants & terminals.

```sql
DECLARE @start_date   DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
DECLARE @end_date     DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
DECLARE @mtd_start    DATE = CAST(DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1) AS DATE)
DECLARE @last30_start DATE = CAST(DATEADD(DAY, -30, GETDATE()) AS DATE)

SELECT
    COUNT(CASE WHEN CAST(rtr.created_on AS DATE) = @start_date THEN 1 END)                                   AS YesterdayCount,
    ISNULL(SUM(CASE WHEN CAST(rtr.created_on AS DATE) = @start_date THEN rtr.amount END), 0)                 AS YesterdayVolume,
    COUNT(CASE WHEN CAST(rtr.created_on AS DATE) BETWEEN @mtd_start AND @end_date THEN 1 END)                AS MTDCount,
    ISNULL(SUM(CASE WHEN CAST(rtr.created_on AS DATE) BETWEEN @mtd_start AND @end_date THEN rtr.amount END), 0) AS MTDVolume,
    COUNT(CASE WHEN CAST(rtr.created_on AS DATE) BETWEEN @last30_start AND @end_date THEN 1 END)             AS Last30DaysCount,
    ISNULL(SUM(CASE WHEN CAST(rtr.created_on AS DATE) BETWEEN @last30_start AND @end_date THEN rtr.amount END), 0) AS Last30DaysVolume,
    COUNT(DISTINCT CASE WHEN CAST(rtr.created_on AS DATE) BETWEEN @last30_start AND @end_date THEN rtr.merchant_id END) AS ActiveMerchants30d,
    COUNT(DISTINCT CASE WHEN CAST(rtr.created_on AS DATE) BETWEEN @last30_start AND @end_date THEN rtr.tid END)         AS ActiveTerminals30d,
    COUNT(DISTINCT rtr.merchant_id)                                                                          AS TotalMerchantsEver,
    COUNT(DISTINCT rtr.tid)                                                                                  AS TotalTIDsEver
FROM OPENMMS.dbo.raast_thirdparty_records rtr
WHERE
    rtr.response_code = '00'
    AND rtr.aggregator_code = '00087'
    AND CAST(rtr.created_on AS DATE) BETWEEN @last30_start AND @end_date
```

---

## Query 2 — Top 10 Merchants by Volume

Configurable date range; defaults to yesterday.

```sql
DECLARE @start_date DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
DECLARE @end_date   DATE = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)

SELECT TOP 10
    rtr.merchant_id                        AS MerchantID,
    m.name                                 AS MerchantName,
    COUNT(rtr.id)                          AS TxnCount,
    CAST(SUM(rtr.amount) AS DECIMAL(18,2)) AS TotalVolume,
    COUNT(DISTINCT rtr.tid)                AS UniqueTIDs,
    MAX(CAST(rtr.created_on AS DATE))      AS LastTxnDate
FROM OPENMMS.dbo.raast_thirdparty_records rtr
LEFT JOIN OPENMMS.dbo.merchant m ON m.id = rtr.merchant_id
WHERE
    rtr.response_code = '00'
    AND rtr.aggregator_code = '00087'
    AND CAST(rtr.created_on AS DATE) BETWEEN @start_date AND @end_date
GROUP BY rtr.merchant_id, m.name
ORDER BY TotalVolume DESC
```

---

## Query 3 — Single Merchant Summary

Filter by merchant_id (exact) or merchant name (LIKE). If name matches >1 merchant, run a COUNT first and ask user to confirm by ID.

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
    /* MERCHANT FILTER:
       AND rtr.merchant_id = <ID>
       OR AND m.name LIKE '%<name>%'
    */
GROUP BY rtr.merchant_id, m.name, rtr.tid
ORDER BY TotalVolume DESC
```

---

## Query 4 — Single Terminal Summary (by TID)

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
    AND rtr.tid = '<TID_HERE>'
    AND CAST(rtr.created_on AS DATE) BETWEEN @start_date AND @end_date
GROUP BY rtr.tid, rtr.merchant_id, m.name
```

---

## Query 5 — Active Merchants & Terminals Dashboard

Last 30 days snapshot.

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

1. **Always DECLARE** `@start_date` / `@end_date` — never hardcode dates.
2. **Always filter** `response_code = '00'` AND `aggregator_code = '00087'`.
3. **Use `CAST(rtr.created_on AS DATE)`** for date comparisons (`created_on` is `DATETIME`).
4. **Use LEFT JOIN** for merchant/terminal lookups — never INNER JOIN (avoids losing records if join fails).
5. **Add `TOP N`** (e.g., `TOP 100`) when result size could be unbounded.
6. **Cast amounts**: `CAST(SUM(...) AS DECIMAL(18,2))` for consistent output.
7. **Forbidden statements**: INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, MERGE, EXEC, EXECUTE, CREATE, GRANT, REVOKE, xp_cmdshell, sp_configure.
8. **Ambiguous merchant name** → run a COUNT first, ask user to select by merchant_id if >1 match.
9. **Only query allowed tables**: `raast_thirdparty_records`, `terminal`, `merchant`. No other tables without explicit permission.
10. **No unbounded queries**: always include a date range or `TOP N`.
