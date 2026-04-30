const sql = require('mssql');
async function main() {
  const pool = await sql.connect({
    server: '192.168.196.9',
    port: 1440,
    database: 'OPENMMS',
    user: 'sreuser',
    password: 'Karachi@123',
    options: { encrypt: true, trustServerCertificate: true }
  });

  const r = await pool.request().query(`
    SELECT TOP 5
      rtr.tid AS TID,
      rtr.merchant_id AS MerchantID,
      COALESCE(NULLIF(m.display_name,''), NULLIF(m.name,''), rtr.merchant_id) AS MerchantName,
      COUNT(rtr.id) AS TxnCount
    FROM OPENMMS.dbo.raast_thirdparty_records rtr
    LEFT JOIN OPENMMS.dbo.terminal t ON t.source_tid = rtr.tid
    LEFT JOIN OPENMMS.dbo.merchant m ON m.id = t.merchant_id
    WHERE rtr.response_code = '00'
      AND rtr.aggregator_code = '00087'
    GROUP BY rtr.tid, rtr.merchant_id, COALESCE(NULLIF(m.display_name,''), NULLIF(m.name,''), rtr.merchant_id)
    ORDER BY TxnCount DESC
  `);

  console.log(JSON.stringify(r.recordset, null, 2));
  await pool.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
