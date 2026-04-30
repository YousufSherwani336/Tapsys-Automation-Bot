# NBP OPENMMS Schema Snapshot

**Database:** OPENMMS (SQL Server `192.168.196.9:1440`)
**Catalog:** `nbp-raast-thirdparty-records`
**Captured:** 2026-04-29

> This snapshot documents the table structure used for NBP RAAST reporting.
> Before running new queries, verify against the live DB if schema may have changed.

---

## Table: `OPENMMS.dbo.raast_thirdparty_records`

Main fact table for all NBP RAAST transactions.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | INT | NOT NULL | Primary key |
| `merchant_id` | INT | NOT NULL | FK → merchant.id |
| `tid` | VARCHAR | NOT NULL | Terminal identifier (string) |
| `amount` | DECIMAL | NOT NULL | Transaction amount in PKR |
| `response_code` | VARCHAR | NOT NULL | `'00'` = successful |
| `aggregator_code` | VARCHAR | NOT NULL | NBP = `'00087'` |
| `created_on` | DATETIME | NOT NULL | Transaction timestamp (use CAST AS DATE for comparisons) |
| `status` | VARCHAR | NULL | Transaction status string |

**Key filter values:**
- `response_code = '00'` — successful transactions only
- `aggregator_code = '00087'` — NBP aggregator only

---

## Table: `OPENMMS.dbo.terminal`

Terminal master table.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | INT | NOT NULL | Primary key |
| `tid` | VARCHAR | NOT NULL | Terminal identifier |
| `merchant_id` | INT | NOT NULL | FK → merchant.id |
| `status` | VARCHAR | NOT NULL | `'active'` / `'inactive'` |
| `terminal_type` | INT | NULL | Exclude type=2 (soft-POS) where applicable |
| `created_at` | DATETIME | NOT NULL | Registration date |

---

## Table: `OPENMMS.dbo.merchant`

Merchant master table.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | INT | NOT NULL | Primary key (= merchant_id in rtr) |
| `name` | VARCHAR | NOT NULL | Merchant display name |
| `status` | VARCHAR | NOT NULL | `'active'` / `'inactive'` |
| `created_at` | DATETIME | NOT NULL | Onboarding date |

---

## Safe Schema Discovery Queries

Run these on the live DB to verify the snapshot is still accurate.

### List all columns in raast_thirdparty_records
```sql
SELECT TOP 100
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo'
  AND TABLE_NAME = 'raast_thirdparty_records'
ORDER BY ORDINAL_POSITION
```

### List all columns in terminal
```sql
SELECT TOP 100
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo'
  AND TABLE_NAME = 'terminal'
ORDER BY ORDINAL_POSITION
```

### List all columns in merchant
```sql
SELECT TOP 100
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo'
  AND TABLE_NAME = 'merchant'
ORDER BY ORDINAL_POSITION
```

### Count of NBP records (quick sanity check)
```sql
SELECT
    COUNT(*)                           AS TotalNBPRecords,
    COUNT(DISTINCT merchant_id)        AS DistinctMerchants,
    COUNT(DISTINCT tid)                AS DistinctTIDs,
    MIN(CAST(created_on AS DATE))      AS EarliestTxn,
    MAX(CAST(created_on AS DATE))      AS LatestTxn
FROM OPENMMS.dbo.raast_thirdparty_records
WHERE
    response_code = '00'
    AND aggregator_code = '00087'
```

### Distinct aggregator_codes (verify NBP code)
```sql
SELECT TOP 20
    aggregator_code,
    COUNT(*) AS RecordCount
FROM OPENMMS.dbo.raast_thirdparty_records
GROUP BY aggregator_code
ORDER BY RecordCount DESC
```

---

## Notes

- Region/KYC joins are not modeled here. If city/region columns are needed, verify their table and join path before using.
- `terminal_type = 2` is soft-POS; exclude from hardware terminal counts if required.
- All date filtering must use `CAST(created_on AS DATE)` since `created_on` is `DATETIME`.
- Never use `toISOString()` UTC dates from application code — always use server-side `GETDATE()` with `DECLARE`.
