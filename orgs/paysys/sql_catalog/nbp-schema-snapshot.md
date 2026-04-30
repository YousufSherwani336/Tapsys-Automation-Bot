# NBP OPENMMS Schema Snapshot

**Database:** OPENMMS (SQL Server `192.168.196.9:1440`)**User:** sreuser (read-only)
**Aggregator code for NBP QR on POS:** `'00087'` (used in WHERE clause)
**Note:** Some records use aggregator_code `'81000'` — these are different products.

---

## Table: `raast_thirdparty_records`

Primary transaction table. Each row = one RAAST QR payment.

| Column | Type | Notes |
|--------|------|-------|
| id | BIGINT (PK) | Auto-increment |
| type | VARCHAR(25) | nullable |
| **merchant_id** | VARCHAR(15) | **Merchant source ID** — matches `merchant.source_mid` |
| fee_value | VARCHAR(15) | |
| **tid** | VARCHAR(9) | **Terminal ID** — matches `terminal.source_tid` |
| **amount** | FLOAT | Transaction amount |
| net_amount | FLOAT | After fee deduction |
| rtp_status | VARCHAR(30) | "Non RTP" / "RTP" |
| payment_status | VARCHAR(30) | "Payment Accepted" etc |
| message_id | VARCHAR(255) | |
| stan | VARCHAR(6) | |
| rrn | VARCHAR(12) | Retrieval reference number |
| response_description | VARCHAR(3000) | "Success" etc |
| payer_iban | VARCHAR(24) | |
| payer_account_title | VARCHAR(140) | Payer name |
| payer_bank_bic | VARCHAR(15) | |
| **aggregator_code** | VARCHAR(10) | **Filter key** — use '00087' for NBP QR |
| payee_account_title | VARCHAR(140) | Merchant account holder |
| expiry_date | DATETIME2 | |
| execution_date | DATETIME2 | |
| payee_iban | VARCHAR(24) | |
| payee_bank_bic | VARCHAR(15) | |
| qr_string | VARCHAR(2700) | Full QR payload |
| **response_code** | VARCHAR(3) | '00' = success |
| payment_info_datetime | VARCHAR(20) | |
| **modified_on** | DATETIME2 | NOT NULL |
| **created_on** | DATETIME2 | NOT NULL — **transaction timestamp** |
| transaction_type | VARCHAR(2) | |
| transaction_channel | VARCHAR(25) | "THIRD_PARTY_SQRC" etc |
| reference_label | VARCHAR(50) | |
| latitude | VARCHAR(10) | |
| longitude | VARCHAR(10) | |
| **dba** | VARCHAR(50) | "Doing Business As" — shop name from QR |
| mcc | VARCHAR(MAX) | Merchant Category Code |
| payee_name | VARCHAR(MAX) | |
| fee_type | VARCHAR(15) | |
| settled_via_rtgs | NUMERIC | 0/1 |
| rtgs_batch_no | VARCHAR(50) | |
| rtgs_date_time | DATETIME2 | |
| is_onus | NUMERIC | 0=off-us, 1=on-us |
| deducted_amount | REAL | |
| aggregator_commission | REAL | |
| is_agg_commission_calculated | NUMERIC | |
| **Region** | VARCHAR(100) | **Region name** — "Punjab", "KP", "Sindh", "Balochistan", "Islamabad", "Gilgit Baltistan", "AJK" |
| fed_value | FLOAT | |
| fed_amount | FLOAT | |
| mdr_fee_after_fed_deduction | FLOAT | |
| branch_code | VARCHAR(255) | |
| phone_no | VARCHAR(255) | |
| mobile_no | VARCHAR(255) | |
| email | VARCHAR(255) | |
| town_name | VARCHAR(255) | |
| address | VARCHAR(255) | |
| sub_dept | VARCHAR(255) | |
| rtp_id | VARCHAR(255) | |
| currency | VARCHAR(5) | |
| is_default | BIT | |
| loyalty_no | VARCHAR(255) | |
| customer_label | VARCHAR(255) | |
| is_mqtt | BIT | |
| product_serial_no | VARCHAR(50) | |
| IS_BILL_PAID | BIT | |
| BILL_DUE_DATE | VARCHAR(255) | |
| BILLER_ID | VARCHAR(255) | |
| BILL_NUMBER | VARCHAR(255) | |
| IS_PHS | BIT | |
| biller_transaction_id | VARCHAR(12) | |
| settlement_account | VARCHAR(24) | |
| short_dba | VARCHAR(100) | |

**Indexes:**
- PK on `id` (clustered)
- `IX_rrn` on (rrn, payment_status)
- `missing_index_30_29` on (created_on, is_onus)
- `missing_index_32_31` on (created_on, response_description, is_onus)

---

## Table: `merchant`

Master merchant records.

| Column | Type | Notes |
|--------|------|-------|
| id | BIGINT (PK) | Auto-increment |
| contact_number | VARCHAR(255) | |
| creation_date | DATETIME2 | When merchant was onboarded |
| **name** | VARCHAR(255) | Merchant legal name |
| mgsp_status | INT | |
| modified_date | DATETIME2 | |
| **display_name** | VARCHAR(255) | **Friendly name** — use this for reports |
| ntn | VARCHAR(255) | Tax number |
| qr_status | INT | |
| short_description | VARCHAR(255) | |
| **source_mid** | VARCHAR(255) | **Merchant source ID** — matches `raast_thirdparty_records.merchant_id` |
| **status** | VARCHAR(255) | "Active" / "Inactive" etc |
| parent_id | BIGINT (FK → merchant.id) | For sub-merchants |
| merchant_category | VARCHAR(255) | MCC code |
| banner_file_name | VARCHAR(255) | |
| logo_file_name | VARCHAR(255) | |
| daily_turnover | BIGINT | |
| serial_number | VARCHAR(255) | |
| is_cancellation_allowed | BIT | |
| is_refund_allowed | BIT | |
| rm_cell_number | VARCHAR(255) | Relationship manager |
| rm_name | VARCHAR(255) | |
| sms_allowed | BIT | |
| portal_access | BIT | |
| masterpass_merchant_id | VARCHAR(255) | |
| active_date | DATETIME2 | |
| dib_kyc | INT | |
| ubl_kyc | INT | |
| **qr_mid** | VARCHAR(255) | Alt merchant ID for QR (often NULL) |
| int_trx_allowed | BIT | International transactions |
| digital_onboarding_type | VARCHAR(255) | |
| keyed_in_enable | INT | |
| is_corporate | INT | |
| edfapay_sdk_token | VARCHAR(255) | |
| settlement_type | VARCHAR(15) | "Instant" etc |
| auto_settlement_time | VARCHAR(255) | |
| is_auto_settled | INT | |
| onelink_status | VARCHAR(255) | |
| euronet_scheme_allowed | BIT | |
| instant_payout_allowed | INT | |
| mastercard_enabled | BIT | |
| visa_enabled | BIT | |
| is_sound_box_enabled | BIT | |
| merchant_cas_registered | BIT | |
| is_phs | BIT | |

**Indexes:**
- PK on `id` (clustered)
- `sourceMidIndex` on (source_mid)
- `UQ_source_mid` UNIQUE on (source_mid)
- `DisplayNameIndex` on (name)
- `ContactNumberIndex` on (contact_number)
- `idx_merchant_status` on (status)
- Many more index combinations

**Key FK:** `merchant.parent_id` → `merchant.id` (self-referencing for sub-merchants)

---

## Table: `terminal`

Terminal devices registered under merchants.

| Column | Type | Notes |
|--------|------|-------|
| id | BIGINT (PK) | Auto-increment |
| address1 | VARCHAR(255) | |
| address2 | VARCHAR(255) | |
| city | VARCHAR(255) | City code |
| cnic | VARCHAR(255) | Owner CNIC |
| contact_email | VARCHAR(255) | |
| contact_number | VARCHAR(255) | |
| creation_date | DATETIME2 | When terminal was created |
| mgsp_status | SMALLINT | |
| modified_date | DATETIME2 | |
| **name** | VARCHAR(255) | Terminal owner name |
| **source_tid** | VARCHAR(255) | **Terminal ID** — matches `raast_thirdparty_records.tid` |
| **status** | VARCHAR(255) | "Active" etc |
| inventory_id | BIGINT (FK) | |
| **merchant_id** | BIGINT (FK → merchant.id) | **Links terminal to merchant** |
| terminal_type | BIGINT (FK → terminal_types.id) | |
| terminal_tmk | VARCHAR(255) | |
| product_serial_number | VARCHAR(255) | |
| product_id | BIGINT (FK) | |
| source_tid_bk | NVARCHAR(20) | Backup TID |
| source_tid_u | BIT | |
| raast_status | VARCHAR(50) | "Cas_Active", "Unregistered" etc |
| response_code | VARCHAR(3) | |
| response_desc | VARCHAR(255) | |
| payment_method_id | BIGINT (FK) | |
| alias_type | VARCHAR(255) | "TILL_CODE" |
| alias_value | VARCHAR(255) | Same as source_tid usually |
| transaction_limit | DECIMAL | |

**Indexes:**
- PK on `id` (clustered)
- `SourceTidIndex` on (source_tid)
- `MerchantIndex` on (merchant_id)
- `CreationDateIndex` on (creation_date)
- `uq_terminal_tid_per_merchant` UNIQUE on (merchant_id, source_tid)

**Key FK:** `terminal.merchant_id` → `merchant.id`

---

## JOIN Relationships

```
raast_thirdparty_records.tid  ──→  terminal.source_tid
terminal.merchant_id          ──→  merchant.id
raast_thirdparty_records.merchant_id  ==  merchant.source_mid
```

**Correct JOIN pattern:**
```sql
FROM raast_thirdparty_records r
LEFT JOIN terminal t ON t.source_tid = r.tid
LEFT JOIN merchant m ON m.id = t.merchant_id
```

**Alternative (direct, no terminal hop):**
```sql
FROM raast_thirdparty_records r
LEFT JOIN merchant m ON m.source_mid = r.merchant_id
```

---

## Sample Data Observations

- `raast_thirdparty_records.Region` values: "Punjab", "KP", "Sindh", "Balochistan", "Islamabad", "Gilgit Baltistan", "AJK"
- Mapping for reports: Punjab → "Central", KP/Islamabad/Gilgit Baltistan/AJK → "North", Sindh/Balochistan → "South"
- `merchant.display_name` is the preferred display name (e.g., "AWAN AUTOS", "TAHIR IMTIAZ SUPER STORE")
- `merchant.name` is often the owner's legal name
- `terminal.name` also stores the owner name
- `aggregator_code` for NBP = '00087' (filter needed in WHERE clause)