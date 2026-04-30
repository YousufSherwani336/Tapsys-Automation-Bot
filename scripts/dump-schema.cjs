const sql = require('mssql');
const config = {
  server: '192.168.196.9',
  port: 1440,
  database: 'OPENMMS',
  user: 'sreuser',
  password: 'Karachi@123',
  options: { encrypt: true, trustServerCertificate: true }
};

async function run() {
  const pool = await sql.connect(config);
  const tables = ['raast_thirdparty_records', 'merchant', 'terminal'];

  for (const t of tables) {
    console.log('\n========== TABLE: ' + t + ' ==========');
    const r = await pool.request().query(
      `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME = '${t}'
       ORDER BY ORDINAL_POSITION`
    );
    r.recordset.forEach(row => {
      const len = row.CHARACTER_MAXIMUM_LENGTH ? '(' + row.CHARACTER_MAXIMUM_LENGTH + ')' : '';
      console.log('  ' + row.COLUMN_NAME + ' | ' + row.DATA_TYPE + len + ' | nullable=' + row.IS_NULLABLE + (row.COLUMN_DEFAULT ? ' | default=' + row.COLUMN_DEFAULT : ''));
    });
  }

  for (const t of tables) {
    console.log('\n--- INDEXES on ' + t + ' ---');
    const r2 = await pool.request().query(
      `SELECT i.name AS index_name, i.type_desc, STRING_AGG(c.name, ', ') AS columns
       FROM sys.indexes i
       JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
       JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
       WHERE i.object_id = OBJECT_ID('dbo.${t}')
       GROUP BY i.name, i.type_desc`
    );
    r2.recordset.forEach(row => console.log('  ' + row.index_name + ' (' + row.type_desc + '): ' + row.columns));
  }

  console.log('\n--- FOREIGN KEYS ---');
  const fk = await pool.request().query(
    `SELECT fk.name AS fk_name, tp.name AS parent_table, cp.name AS parent_column,
            tr.name AS ref_table, cr.name AS ref_column
     FROM sys.foreign_keys fk
     JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
     JOIN sys.tables tp ON fkc.parent_object_id = tp.object_id
     JOIN sys.columns cp ON fkc.parent_object_id = cp.object_id AND fkc.parent_column_id = cp.column_id
     JOIN sys.tables tr ON fkc.referenced_object_id = tr.object_id
     JOIN sys.columns cr ON fkc.referenced_object_id = cr.object_id AND fkc.referenced_column_id = cr.column_id
     WHERE tp.name IN ('raast_thirdparty_records', 'merchant', 'terminal')
        OR tr.name IN ('raast_thirdparty_records', 'merchant', 'terminal')`
  );
  fk.recordset.forEach(row => console.log('  ' + row.fk_name + ': ' + row.parent_table + '.' + row.parent_column + ' -> ' + row.ref_table + '.' + row.ref_column));

  console.log('\n--- SAMPLE: raast_thirdparty_records (top 3) ---');
  const s1 = await pool.request().query('SELECT TOP 3 * FROM dbo.raast_thirdparty_records ORDER BY created_on DESC');
  console.log(JSON.stringify(s1.recordset, null, 2));

  console.log('\n--- SAMPLE: terminal (top 3) ---');
  const s2 = await pool.request().query('SELECT TOP 3 * FROM dbo.terminal ORDER BY creation_date DESC');
  console.log(JSON.stringify(s2.recordset, null, 2));

  console.log('\n--- SAMPLE: merchant (top 3) ---');
  const s3 = await pool.request().query('SELECT TOP 3 * FROM dbo.merchant ORDER BY creation_date DESC');
  console.log(JSON.stringify(s3.recordset, null, 2));

  // Check what connects raast records to terminals/merchants
  console.log('\n--- JOIN TEST: raast -> terminal -> merchant (top 5) ---');
  const jt = await pool.request().query(
    `SELECT TOP 5
       r.tid AS raast_tid, r.merchant_id AS raast_merchant_id,
       t.id AS terminal_id, t.source_tid, t.merchant_id AS terminal_merchant_id, t.name AS terminal_name,
       m.id AS merchant_id_pk, m.name AS merchant_name, m.display_name, m.source_mid, m.qr_mid
     FROM dbo.raast_thirdparty_records r
     LEFT JOIN dbo.terminal t ON t.source_tid = r.tid
     LEFT JOIN dbo.merchant m ON m.id = t.merchant_id
     WHERE r.created_on >= DATEADD(DAY, -1, GETDATE())
     ORDER BY r.created_on DESC`
  );
  console.log(JSON.stringify(jt.recordset, null, 2));

  await pool.close();
}

run().catch(e => { console.error(e.message); process.exit(1); });
