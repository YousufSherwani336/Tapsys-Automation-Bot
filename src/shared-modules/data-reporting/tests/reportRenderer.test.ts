import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReportRenderer } from '../lib/reportRenderer.js';

// ─── Sample data fixtures ──────────────────────────────────────────────────

const SUMMARY_ROWS = [
  {
    RowType: 'SUMMARY', Aggregator: 'NBP', Region: 'Central',
    'Total Merchants': '1,200', 'Total Terminals': '3,400',
    'Active Merchants (30d)': '800', 'Active Terminals (30d)': '2,100',
    'Active Merchant %': '66.67%', 'Active Terminal %': '61.76%',
    'Sale Volume Yesterday': '5,000,000', 'Yesterday Count': '1,200',
    'Sale Volume MTD': '85,000,000', 'MTD Count': '21,500',
    'Merchants Added Yesterday': '5', 'Terminals Added Yesterday': '12',
    'Merchant Name': null, 'Merchant Txn Count': null, 'Merchant Txn Amount': null,
  },
  {
    RowType: 'SUMMARY', Aggregator: 'NBP', Region: 'North',
    'Total Merchants': '600', 'Total Terminals': '1,800',
    'Active Merchants (30d)': '350', 'Active Terminals (30d)': '1,100',
    'Active Merchant %': '58.33%', 'Active Terminal %': '61.11%',
    'Sale Volume Yesterday': '2,500,000', 'Yesterday Count': '600',
    'Sale Volume MTD': '40,000,000', 'MTD Count': '10,200',
    'Merchants Added Yesterday': '2', 'Terminals Added Yesterday': '5',
    'Merchant Name': null, 'Merchant Txn Count': null, 'Merchant Txn Amount': null,
  },
  {
    RowType: 'SUMMARY', Aggregator: 'TOTAL', Region: 'ALL',
    'Total Merchants': '1,800', 'Total Terminals': '5,200',
    'Active Merchants (30d)': '1,150', 'Active Terminals (30d)': '3,200',
    'Active Merchant %': '63.89%', 'Active Terminal %': '61.54%',
    'Sale Volume Yesterday': '7,500,000', 'Yesterday Count': '1,800',
    'Sale Volume MTD': '125,000,000', 'MTD Count': '31,700',
    'Merchants Added Yesterday': '7', 'Terminals Added Yesterday': '17',
    'Merchant Name': null, 'Merchant Txn Count': null, 'Merchant Txn Amount': null,
  },
];

const MERCHANT_ROWS = [
  { RowType: 'MERCHANT', Aggregator: 'NBP', Region: null, 'Merchant Name': 'ABC Store', 'Merchant Txn Count': '320', 'Merchant Txn Amount': '1,200,000' },
  { RowType: 'MERCHANT', Aggregator: 'NBP', Region: null, 'Merchant Name': 'XYZ Mart', 'Merchant Txn Count': '210', 'Merchant Txn Amount': '980,000' },
];

const FULL_DASHBOARD_ROWS = [...SUMMARY_ROWS, ...MERCHANT_ROWS];

const TOP_MERCHANTS_ROWS = [
  { MerchantID: 1, MerchantName: 'ABC Store', TxnCount: 320, TotalVolume: 1200000, UniqueTIDs: 5, LastTxnDate: '2025-01-14' },
  { MerchantID: 2, MerchantName: 'XYZ Mart', TxnCount: 210, TotalVolume: 980000, UniqueTIDs: 3, LastTxnDate: '2025-01-14' },
  { MerchantID: 3, MerchantName: 'FastPay Ltd', TxnCount: 180, TotalVolume: 750000, UniqueTIDs: 2, LastTxnDate: '2025-01-14' },
];

const MERCHANT_SUMMARY_ROWS = [
  { MerchantID: 1, MerchantName: 'ABC Store', TID: 'T001', TxnCount: 120, TotalVolume: 480000, FirstTxnDate: '2024-10-01', LastTxnDate: '2025-01-14' },
  { MerchantID: 1, MerchantName: 'ABC Store', TID: 'T002', TxnCount: 200, TotalVolume: 720000, FirstTxnDate: '2024-09-15', LastTxnDate: '2025-01-14' },
];

const TERMINAL_SUMMARY_ROWS = [
  { TID: 'T001', MerchantID: 1, MerchantName: 'ABC Store', TxnCount: 120, TotalVolume: 480000, FirstTxnDate: '2024-10-01', LastTxnDate: '2025-01-14' },
];

const METRIC_CARD_ROWS = [
  { YesterdayCount: 1800, YesterdayVolume: 7500000, MTDCount: 31700, MTDVolume: 125000000, ActiveMerchants30d: 1150, ActiveTerminals30d: 3200 },
];

const REGION_SUMMARY_ROWS = [
  { Region: 'Central', YesterdayCount: 1200, SaleVolumeYesterday: 5000000, MTDCount: 21500, SaleVolumeMTD: 85000000 },
  { Region: 'North', YesterdayCount: 600, SaleVolumeYesterday: 2500000, MTDCount: 10200, SaleVolumeMTD: 40000000 },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

const BASE = {
  reportTitle: 'Test Report',
  dateRange: 'Yesterday (2025-01-14)',
  timezone: 'Asia/Karachi',
};

// ─── Test suite ─────────────────────────────────────────────────────────────

describe('ReportRenderer', () => {
  let tmpDir: string;
  let renderer: ReportRenderer;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'report-test-'));
    renderer = new ReportRenderer({ outputDir: tmpDir, timezone: 'Asia/Karachi' });
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // ── Render type dispatch ────────────────────────────────────────────────

  it('full_dashboard — renders without error and sets filename', async () => {
    const result = await renderer.render({
      ...BASE,
      rows: FULL_DASHBOARD_ROWS,
      renderType: 'full_dashboard',
      outputDir: tmpDir,
    });
    expect(result.filename).toMatch(/report_\d+\.png/);
    expect(result.textFallback).toContain('Test Report');
  });

  it('top_merchants — renders without error', async () => {
    const result = await renderer.render({
      ...BASE,
      rows: TOP_MERCHANTS_ROWS,
      renderType: 'top_merchants',
      outputDir: tmpDir,
    });
    expect(result.filename).toMatch(/\.png$/);
    expect(result.textFallback).toContain('Test Report');
  });

  it('region_summary — renders without error', async () => {
    const result = await renderer.render({
      ...BASE,
      rows: REGION_SUMMARY_ROWS,
      renderType: 'region_summary',
      outputDir: tmpDir,
    });
    expect(result.filename).toMatch(/\.png$/);
    expect(result.textFallback).toContain('Test Report');
  });

  it('merchant_summary — renders without error', async () => {
    const result = await renderer.render({
      ...BASE,
      rows: MERCHANT_SUMMARY_ROWS,
      renderType: 'merchant_summary',
      outputDir: tmpDir,
    });
    expect(result.filename).toMatch(/\.png$/);
    expect(result.textFallback).toContain('Test Report');
  });

  it('terminal_summary — renders without error', async () => {
    const result = await renderer.render({
      ...BASE,
      rows: TERMINAL_SUMMARY_ROWS,
      renderType: 'terminal_summary',
      outputDir: tmpDir,
    });
    expect(result.filename).toMatch(/\.png$/);
    expect(result.textFallback).toContain('Test Report');
  });

  it('metric_card — renders without error', async () => {
    const result = await renderer.render({
      ...BASE,
      rows: METRIC_CARD_ROWS,
      renderType: 'metric_card',
      outputDir: tmpDir,
    });
    expect(result.filename).toMatch(/\.png$/);
    expect(result.textFallback).toContain('Test Report');
  });

  // ── Auto no_data detection ──────────────────────────────────────────────

  it('empty rows → no_data regardless of requested renderType', async () => {
    const result = await renderer.render({
      ...BASE,
      rows: [],
      renderType: 'top_merchants',
      outputDir: tmpDir,
    });
    expect(result.filename).toMatch(/\.png$/);
    expect(result.textFallback).toContain('No data found');
  });

  it('null renderType + empty rows → no_data', async () => {
    const result = await renderer.render({
      ...BASE,
      rows: [],
      outputDir: tmpDir,
    });
    expect(result.filename).toMatch(/\.png$/);
    expect(result.textFallback).toContain('No data found');
  });

  // ── Legacy alias resolution ────────────────────────────────────────────

  it('legacy alias "dashboard" resolves to full_dashboard layout', async () => {
    const result = await renderer.render({
      ...BASE,
      rows: FULL_DASHBOARD_ROWS,
      renderType: 'dashboard',
      outputDir: tmpDir,
    });
    expect(result.filename).toMatch(/\.png$/);
    expect(result.textFallback).toContain('Test Report');
  });

  it('legacy alias "table" resolves to comparison_table layout', async () => {
    const result = await renderer.render({
      ...BASE,
      rows: TOP_MERCHANTS_ROWS,
      renderType: 'table',
      outputDir: tmpDir,
    });
    expect(result.filename).toMatch(/\.png$/);
    expect(result.textFallback).toContain('Test Report');
  });

  // ── Long table truncation ──────────────────────────────────────────────

  it('comparison_table with 50 rows includes truncation notice in textFallback', async () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      MerchantName: `Merchant ${i + 1}`,
      TxnCount: 100 + i,
      TotalVolume: 10000 + i * 500,
    }));
    const result = await renderer.render({
      ...BASE,
      rows,
      renderType: 'comparison_table',
      truncated: true,
      rowCount: 200,
      outputDir: tmpDir,
    });
    expect(result.filename).toMatch(/\.png$/);
    expect(result.textFallback).toContain('200');
  });

  // ── Image file exists on Linux/Mac (canvas available) ─────────────────

  it.skipIf(process.platform === 'win32')(
    'generated PNG file exists with size > 0 bytes',
    async () => {
      const result = await renderer.render({
        ...BASE,
        rows: TOP_MERCHANTS_ROWS,
        renderType: 'top_merchants',
        outputDir: tmpDir,
      });
      expect(result.imagePath).not.toBeNull();
      const fileStat = await stat(result.imagePath!);
      expect(fileStat.size).toBeGreaterThan(0);
    },
  );

  it.skipIf(process.platform === 'win32')(
    'full_dashboard PNG exists with size > 0 bytes',
    async () => {
      const result = await renderer.render({
        ...BASE,
        rows: FULL_DASHBOARD_ROWS,
        renderType: 'full_dashboard',
        outputDir: tmpDir,
      });
      expect(result.imagePath).not.toBeNull();
      const fileStat = await stat(result.imagePath!);
      expect(fileStat.size).toBeGreaterThan(0);
    },
  );
});
