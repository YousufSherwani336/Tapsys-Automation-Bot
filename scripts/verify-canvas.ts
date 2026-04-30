/**
 * Canvas-only test — no DB needed.
 * Renders a synthetic PNG with dummy data to verify canvas native binaries work.
 * Run with: npx tsx scripts/verify-canvas.ts
 */

import { ReportRenderer } from '../src/shared-modules/data-reporting/lib/reportRenderer.js';
import { stat } from 'node:fs/promises';

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  CANVAS IMAGE GENERATION TEST (no DB)');
  console.log('══════════════════════════════════════════════════════\n');

  const renderer = new ReportRenderer({
    outputDir: 'output/reports',
    timezone: 'Asia/Karachi',
  });

  const dummyRows = [
    { Metric: 'Yesterday Txns', Value: '1,234', Amount: 'PKR 5,678,900' },
    { Metric: 'MTD Txns', Value: '28,456', Amount: 'PKR 134,567,890' },
    { Metric: 'Active Merchants', Value: '89', Amount: '—' },
    { Metric: 'Active Terminals', Value: '142', Amount: '—' },
  ];

  console.log('Rendering synthetic NBP dashboard PNG...');
  const result = await renderer.render({
    rows: dummyRows,
    reportTitle: 'NBP Summary Dashboard (SYNTHETIC)',
    dateRange: 'Canvas test — no real DB data',
    renderType: 'table',
    outputDir: 'output/reports',
    rowCount: dummyRows.length,
    truncated: false,
  });

  if (!result.imagePath) {
    console.log('\n  BLOCKED ON WINDOWS — canvas native binaries not compiled.');
    console.log('  Text fallback:', result.textFallback.slice(0, 120));
    console.log('\n══════════════════════════════════════════════════════');
    console.log('  RESULT: BLOCKED ON WINDOWS (expected — use Linux)');
    console.log('══════════════════════════════════════════════════════\n');
    process.exit(0);
  }

  const fileStat = await stat(result.imagePath);
  const imagePath = result.imagePath;
  console.log(`  File:  ${imagePath}`);
  console.log(`  Size:  ${fileStat.size} bytes`);
  console.log(`  ${fileStat.size > 0 ? '✓ Image file exists and is non-empty' : '✗ File is empty'}`);
  console.log(`  Filename: ${result.filename}`);

  console.log('\n══════════════════════════════════════════════════════');
  console.log(`  RESULT: ${fileStat.size > 0 ? '✓ CANVAS VERIFIED' : '✗ CANVAS FAILED'}`);
  console.log('══════════════════════════════════════════════════════\n');
}

main().catch(err => {
  if (err.message?.includes('canvas') || err.message?.includes('bindings') || err.message?.includes('Cannot find module')) {
    console.error('\n  BLOCKED ON WINDOWS — canvas native binaries not compiled.');
    console.error('  On Linux, run: npm install  (with libcairo2-dev installed)');
    console.error(`  Error: ${err.message?.split('\n')[0]}`);
  } else {
    console.error('\n✗ CANVAS TEST FAILED:', err.message ?? err);
  }
  process.exit(1);
});
