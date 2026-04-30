import 'dotenv/config';
import dotenv from 'dotenv';
import mssql from 'mssql';
dotenv.config({ path: 'orgs/paysys/.env' });
const cfg = {
  server: process.env.DB_OPENMMS_HOST,
  port: parseInt(process.env.DB_OPENMMS_PORT || '1440'),
  database: process.env.DB_OPENMMS_NAME,
  user: process.env.DB_OPENMMS_USER,
  password: process.env.DB_OPENMMS_PASS,
  options: { encrypt: true, trustServerCertificate: true },
};
async function main() {
  const pool = await mssql.connect(cfg);
  
  console.log('=== raast_thirdparty_records ===');
  const r1 = await pool.query("SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='raast_thirdparty_records' ORDER BY ORDINAL_POSITION");
  console.log(JSON.stringify(r1.recordset, null, 2));

  console.log('\n=== terminal ===');
  const r2 = await pool.query("SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='terminal' ORDER BY ORDINAL_POSITION");
  console.log(JSON.stringify(r2.recordset, null, 2));

  console.log('\n=== merchant ===');
  const r3 = await pool.query("SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='merchant' ORDER BY ORDINAL_POSITION");
  console.log(JSON.stringify(r3.recordset, null, 2));

  process.exit(0);
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
