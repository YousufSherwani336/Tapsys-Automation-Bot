/**
 * Dynamic report renderer — generates PNG images from query results.
 *
 * Supports 8 layout types selected by renderType in RenderInput:
 *   full_dashboard   | top_merchants | region_summary | merchant_summary
 *   terminal_summary | metric_card   | comparison_table | no_data
 *
 * Legacy aliases: 'dashboard' → full_dashboard, 'table' → comparison_table,
 *   'metric_cards' → metric_card.
 *
 * Canvas (node-canvas) required for PNG output. Falls back to text on Windows
 * where native binaries aren't compiled.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import pino from 'pino';
import type { CanvasRenderingContext2D as CanvasCtx } from 'canvas';

const logger = pino({ name: 'report-renderer' });

// ─── Types ─────────────────────────────────────────────────────────────────

export type RenderType =
  | 'full_dashboard'     // multi-section: KPI cards + regional tables + top merchants
  | 'top_merchants'      // ranked merchant table
  | 'region_summary'     // compact region cards + table
  | 'merchant_summary'   // merchant card + txn metrics
  | 'terminal_summary'   // terminal-specific report
  | 'metric_card'        // 1–6 large metric cards
  | 'comparison_table'   // generic clean table
  | 'no_data'            // empty result placeholder
  | 'dashboard'          // legacy → full_dashboard
  | 'table'              // legacy → comparison_table
  | 'metric_cards';      // legacy → metric_card

export interface RenderInput {
  rows: Record<string, unknown>[];
  reportTitle: string;
  dateRange: string;
  filters?: Record<string, string>;
  renderType?: RenderType;
  truncated?: boolean;
  rowCount?: number;
  outputDir: string;
  timezone?: string;
}

export interface RenderResult {
  imagePath: string | null;
  textFallback: string;
  filename: string;
}

// ─── Palette — NBP green/white theme ──────────────────────────────────────

const C = {
  bg: '#FFFFFF',
  surface: '#F5F9F6',
  border: '#C8DDD2',
  header: '#1a5c38',
  accent: '#1a5c38',
  accentMid: '#2e7d52',
  accentLight: '#2e8b57',
  text: '#1a1a1a',
  textOnGreen: '#FFFFFF',
  textMuted: '#5a7a68',
  totalRow: '#E8F5E9',
  tableRow: '#FFFFFF',
  tableRowAlt: '#EAF4EE',
  warning: '#c0392b',
  white: '#FFFFFF',
};

const W = 1080;  // canvas width — constant

// ─── Public class ──────────────────────────────────────────────────────────

export class ReportRenderer {
  constructor(private readonly cfg: { outputDir: string; timezone: string }) {}

  async render(input: RenderInput): Promise<RenderResult> {
    const filename = `report_${Date.now()}.png`;
    const outputDir = input.outputDir || this.cfg.outputDir;
    const imagePath = join(outputDir, filename);
    const textFallback = buildTextFallback(input);

    const canvasLib = await tryLoadCanvas();
    if (!canvasLib) {
      logger.warn('canvas unavailable — text fallback');
      return { imagePath: null, textFallback, filename };
    }

    try {
      await mkdir(dirname(imagePath), { recursive: true });
      const buffer = await renderToBuffer(canvasLib, input);
      await writeFile(imagePath, buffer);
      logger.info({ imagePath, renderType: input.renderType }, 'Report image saved');
      return { imagePath, textFallback, filename };
    } catch (err) {
      logger.error({ err }, 'Failed to render image — text fallback');
      return { imagePath: null, textFallback, filename };
    }
  }
}

// ─── Canvas loader ─────────────────────────────────────────────────────────

async function tryLoadCanvas(): Promise<typeof import('canvas') | null> {
  try {
    const mod = await import('canvas');
    mod.createCanvas(1, 1);
    return mod;
  } catch {
    return null;
  }
}

// ─── Render dispatcher ─────────────────────────────────────────────────────

async function renderToBuffer(
  canvasLib: typeof import('canvas'),
  input: RenderInput,
): Promise<Buffer> {
  const rt = resolveRenderType(input.renderType, input.rows);
  switch (rt) {
    case 'full_dashboard':    return renderFullDashboard(canvasLib, input);
    case 'top_merchants':     return renderTopMerchants(canvasLib, input);
    case 'region_summary':    return renderRegionSummary(canvasLib, input);
    case 'merchant_summary':  return renderMerchantSummary(canvasLib, input);
    case 'terminal_summary':  return renderTerminalSummary(canvasLib, input);
    case 'metric_card':       return renderMetricCard(canvasLib, input);
    case 'no_data':           return renderNoData(canvasLib, input);
    default:                  return renderComparisonTable(canvasLib, input);
  }
}

function resolveRenderType(rt: RenderType | undefined, rows: Record<string, unknown>[]): string {
  if (!rt || rt === 'table') {
    return rows.length === 0 ? 'no_data' : 'comparison_table';
  }
  if (rt === 'dashboard') return 'full_dashboard';
  if (rt === 'metric_cards') return 'metric_card';
  if (rows.length === 0 && rt !== 'no_data') return 'no_data';
  return rt;
}

// ─── Layout: full_dashboard (Python-style MIS report) ──────────────────────

/** Region sort order matching the Python renderer */
function regionRank(region: string): number {
  const r = (region || '').toUpperCase();
  if (r === 'NORTH') return 1;
  if (r === 'CENTRAL') return 2;
  if (r === 'SOUTH') return 3;
  if (r === 'TOTAL' || r === 'ALL') return 98;
  return 9;
}

/** Parse numeric value from formatted string (e.g., "1,234" → 1234, "45.67%" → 45.67) */
function parseNum(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/,/g, '').replace(/%/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/** Normalize summary rows — handle column name variations from SQL output */
function normalizeSummaryRow(row: Record<string, unknown>): Record<string, unknown> {
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
    }
    return '';
  };
  const region = String(pick('Region') || '');
  const aggregator = String(pick('Aggregator') || '');
  const isTotal = aggregator.toUpperCase() === 'TOTAL' || region.toUpperCase() === 'ALL';

  return {
    Region: isTotal ? 'TOTAL' : region,
    Aggregator: aggregator,
    'Yesterday Count': pick('Yesterday Count', 'Trnx Yesterday Count', 'Txn Count (Yesterday)'),
    'Sale Volume Yesterday': pick('Sale Volume Yesterday', 'Sale Volume (Yesterday)'),
    'MTD Count': pick('MTD Count', 'Trnx MTD Count', 'Txn Count (MTD)'),
    'Sale Volume MTD': pick('Sale Volume MTD', 'Sale Volume (MTD)'),
    'Merchants Added Yesterday': pick('Merchants Added Yesterday', 'Merchants Added (Yesterday)'),
    'Terminals Added Yesterday': pick('Terminals Added Yesterday', 'Terminals Added (Yesterday)'),
    'Active Merchants (30d)': pick('Active Merchants (30d)', 'Merchants Active (L30D)'),
    'Active Terminals (30d)': pick('Active Terminals (30d)', 'Terminals Active (L30D)'),
    'Total Merchants': pick('Total Merchants'),
    'Total Terminals': pick('Total Terminals'),
    'Active Merchant %': pick('Active Merchant %'),
    'Active Terminal %': pick('Active Terminal %'),
    'Merchant Name': pick('Merchant Name'),
    'Merchant Txn Count': pick('Merchant Txn Count'),
    'Merchant Txn Amount': pick('Merchant Txn Amount'),
    __isTotal: isTotal,
  };
}

// ── Python-style color palette for full_dashboard ──
const PY = {
  bg: '#F5FBF7',
  headerBg: '#0D6A35',
  accent: '#1BAA5A',
  tableHeader: '#157E42',
  evenRow: '#EEF8F1',
  oddRow: '#FFFFFF',
  totalRow: '#D4EDDA',
  text: '#1a1a1a',
  textMuted: '#5a7a68',
  white: '#FFFFFF',
  cardBorder: '#C8DDD2',
  cardBg: '#FFFFFF',
};

function renderFullDashboard(canvasLib: typeof import('canvas'), input: RenderInput): Buffer {
  const { createCanvas } = canvasLib;

  const hasRowType = input.rows.length > 0 && 'RowType' in input.rows[0];
  if (!hasRowType) return renderComparisonTable(canvasLib, input);

  // Normalize and categorize rows
  const summaryRaw = input.rows.filter((r) => String(r['RowType']).toUpperCase() === 'SUMMARY');
  const merchantRaw = input.rows.filter((r) => String(r['RowType']).toUpperCase() === 'MERCHANT');

  // Diagnostic: log merchant raw data keys
  if (merchantRaw.length > 0) {
    logger.info({ merchantKeys: Object.keys(merchantRaw[0]), merchantSample: merchantRaw[0] }, 'MERCHANT_ROW_DIAG');
  } else {
    logger.info({ totalRows: input.rows.length, rowTypes: input.rows.map(r => r['RowType']) }, 'NO_MERCHANT_ROWS');
  }

  const summaryRows = summaryRaw.map(normalizeSummaryRow);
  const totalRow = summaryRows.find((r) => r.__isTotal) ?? null;
  const regionRows = summaryRows
    .filter((r) => !r.__isTotal)
    .sort((a, b) => regionRank(String(a['Region'])) - regionRank(String(b['Region'])));

  // Merchant rows: normalize and sort by amount desc
  const merchantRows = merchantRaw
    .map(normalizeSummaryRow)
    .filter((r) => r['Merchant Name'] && String(r['Merchant Name']).trim() !== '')
    .sort((a, b) => {
      const amtA = parseNum(a['Merchant Txn Amount']);
      const amtB = parseNum(b['Merchant Txn Amount']);
      if (amtB !== amtA) return amtB - amtA;
      return parseNum(b['Merchant Txn Count']) - parseNum(a['Merchant Txn Count']);
    });

  // Display rows for tables = region rows + total row at bottom
  const displayRows = [...regionRows, ...(totalRow ? [totalRow] : [])];
  const regionNames = regionRows.map((r) => String(r['Region']));

  // ── Layout constants ──
  const HEADER_H = 110;
  const KPI_SECTION_H = totalRow ? 220 : 0;
  const ROW_H = 48;
  const TABLE_HEADER_H = 48;
  const SECTION_TITLE_H = 50;
  const SECTION_GAP = 30;
  const FOOTER_H = 50;
  const PAD = 30;

  const txnTableH = displayRows.length > 0 ? SECTION_TITLE_H + TABLE_HEADER_H + displayRows.length * ROW_H + SECTION_GAP : 0;
  const growthTableH = displayRows.length > 0 ? SECTION_TITLE_H + TABLE_HEADER_H + displayRows.length * ROW_H + SECTION_GAP : 0;
  const merchTableH = merchantRows.length > 0 ? SECTION_TITLE_H + TABLE_HEADER_H + merchantRows.length * ROW_H + SECTION_GAP : 0;
  const H = HEADER_H + KPI_SECTION_H + txnTableH + growthTableH + merchTableH + FOOTER_H + PAD;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d') as unknown as CanvasCtx;

  // Background
  ctx.fillStyle = PY.bg;
  ctx.fillRect(0, 0, W, H);

  // ── Header ──
  ctx.fillStyle = PY.headerBg;
  ctx.fillRect(0, 0, W, HEADER_H);

  // NBP Badge (white rounded rect)
  const badgeX = 30, badgeY = 25, badgeW = 70, badgeH = 60;
  ctx.fillStyle = PY.white;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 10);
  ctx.font = 'bold 26px Arial';
  ctx.fillStyle = PY.headerBg;
  ctx.textAlign = 'center';
  ctx.fillText('NBP', badgeX + badgeW / 2, badgeY + badgeH / 2 + 9);
  ctx.textAlign = 'left';

  // Title
  const today = new Date().toISOString().slice(0, 10);
  ctx.font = 'bold 24px Arial';
  ctx.fillStyle = PY.white;
  ctx.fillText(`NBP TAPSYS QR ON POS (${today})`, badgeX + badgeW + 20, 55);

  // Subtitle — region names
  ctx.font = '14px Arial';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(regionNames.length > 0 ? regionNames.join(' | ') : 'All Regions', badgeX + badgeW + 20, 80);

  let y = HEADER_H + 20;

  // ── KPI Cards (3x2 grid, left green accent bar) ──
  if (totalRow) {
    const perRow = 3;
    const CARD_W = Math.floor((W - PAD * 2 - 20 * (perRow - 1)) / perRow);
    const CARD_H = 90;
    const GAP = 20;

    // Build KPI data
    const saleVolYesterday = String(totalRow['Sale Volume Yesterday'] || '0');
    const saleVolMTD = String(totalRow['Sale Volume MTD'] || '0');
    const txnYesterday = String(totalRow['Yesterday Count'] || '0');
    const txnMTD = String(totalRow['MTD Count'] || '0');
    const activeMerch = String(totalRow['Active Merchants (30d)'] || '0');
    const totalMerch = String(totalRow['Total Merchants'] || '0');
    const activeTerm = String(totalRow['Active Terminals (30d)'] || '0');
    const totalTerm = String(totalRow['Total Terminals'] || '0');
    const merchPct = String(totalRow['Active Merchant %'] || '100.00%');
    const termPct = String(totalRow['Active Terminal %'] || '100.00%');

    const kpis = [
      { value: saleVolYesterday, label: 'Sale Volume Yesterday' },
      { value: saleVolMTD, label: 'Sale Volume MTD' },
      { value: txnYesterday, label: 'Txn Count Yesterday' },
      { value: txnMTD, label: 'Txn Count MTD' },
      { value: `${activeMerch} / ${totalMerch} (${merchPct})`, label: 'Merchants Active Last\n30 Days' },
      { value: `${activeTerm} / ${totalTerm} (${termPct})`, label: 'Terminals Active Last\n30 Days' },
    ];

    for (let i = 0; i < kpis.length; i++) {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const cx = PAD + col * (CARD_W + GAP);
      const cy = y + row * (CARD_H + GAP);

      // Card background
      ctx.fillStyle = PY.cardBg;
      roundRect(ctx, cx, cy, CARD_W, CARD_H, 6);
      ctx.strokeStyle = PY.cardBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect?.(cx, cy, CARD_W, CARD_H, 6);
      ctx.stroke();

      // Green LEFT accent bar
      ctx.fillStyle = PY.accent;
      ctx.fillRect(cx, cy + 8, 5, CARD_H - 16);

      // Value
      ctx.font = 'bold 20px Arial';
      ctx.fillStyle = PY.text;
      const valText = kpis[i].value.length > 22 ? kpis[i].value.slice(0, 21) + '…' : kpis[i].value;
      ctx.fillText(valText, cx + 18, cy + 38);

      // Label (may have \n)
      ctx.font = '12px Arial';
      ctx.fillStyle = PY.textMuted;
      const labelLines = kpis[i].label.split('\n');
      for (let li = 0; li < labelLines.length; li++) {
        ctx.fillText(labelLines[li], cx + 18, cy + 60 + li * 14);
      }
    }

    y += 2 * (CARD_H + GAP) + 10;
  }

  // ── Transaction Performance Table ──
  if (displayRows.length > 0) {
    y = pyDrawTable(ctx, 'Transaction Performance', [
      { key: 'Region', header: 'Region', numeric: false },
      { key: 'Yesterday Count', header: 'Txn Yesterday', numeric: true },
      { key: 'Sale Volume Yesterday', header: 'Sale Vol Yesterday', numeric: true },
      { key: 'MTD Count', header: 'Txn MTD', numeric: true },
      { key: 'Sale Volume MTD', header: 'Sale Vol MTD', numeric: true },
    ], displayRows, y, ROW_H, TABLE_HEADER_H, SECTION_TITLE_H, PAD);
    y += SECTION_GAP;
  }

  // ── System Growth & Active Base Table ──
  if (displayRows.length > 0) {
    // Build rows with combined active columns
    const growthRows = displayRows.map((r) => {
      const am = String(r['Active Merchants (30d)'] || '0');
      const ampct = String(r['Active Merchant %'] || '');
      const at = String(r['Active Terminals (30d)'] || '0');
      const atpct = String(r['Active Terminal %'] || '');
      return {
        Region: r['Region'],
        'Merchants Added Yesterday': r['Merchants Added Yesterday'],
        'Terminals Added Yesterday': r['Terminals Added Yesterday'],
        'Merchants Active Last 30 Days': ampct ? `${am} (${ampct})` : am,
        'Terminals Active Last 30 Days': atpct ? `${at} (${atpct})` : at,
        __isTotal: r['__isTotal'],
      };
    });

    y = pyDrawTable(ctx, 'System Growth & Active Base', [
      { key: 'Region', header: 'Region', numeric: false },
      { key: 'Merchants Added Yesterday', header: 'Merchants Added\nYesterday', numeric: true },
      { key: 'Terminals Added Yesterday', header: 'Terminals Added\nYesterday', numeric: true },
      { key: 'Merchants Active Last 30 Days', header: 'Merchants Active\nLast 30 Days', numeric: true },
      { key: 'Terminals Active Last 30 Days', header: 'Terminals Active\nLast 30 Days', numeric: true },
    ], growthRows, y, ROW_H, TABLE_HEADER_H, SECTION_TITLE_H, PAD);
    y += SECTION_GAP;
  }

  // ── Top QR on POS Merchants Table ──
  if (merchantRows.length > 0) {
    y = pyDrawTable(ctx, 'Top QR on POS Merchants', [
      { key: 'Merchant Name', header: 'Merchant Name', numeric: false },
      { key: 'Merchant Txn Count', header: 'Txn Count (MTD)', numeric: true },
      { key: 'Merchant Txn Amount', header: 'Txn Amount (MTD)', numeric: true },
    ], merchantRows, y, ROW_H, TABLE_HEADER_H, SECTION_TITLE_H, PAD);
    y += SECTION_GAP;
  }

  // ── Footer ──
  const footerY = Math.max(y, H - FOOTER_H);
  ctx.font = '13px Arial';
  ctx.fillStyle = PY.textMuted;
  ctx.textAlign = 'right';
  const genDate = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  ctx.fillText(`Generated: ${genDate}`, W - PAD, footerY + 30);
  ctx.textAlign = 'left';

  return (canvas as unknown as { toBuffer(type: string): Buffer }).toBuffer('image/png');
}

/** Python-style table drawer for full_dashboard */
function pyDrawTable(
  ctx: CanvasCtx,
  title: string,
  columns: { key: string; header: string; numeric: boolean }[],
  rows: Record<string, unknown>[],
  startY: number,
  rowH: number,
  headerH: number,
  titleH: number,
  pad: number,
): number {
  let y = startY;

  // Section title
  ctx.font = 'bold 18px Arial';
  ctx.fillStyle = PY.text;
  ctx.fillText(title, pad, y + titleH / 2 + 6);
  y += titleH;

  // Filter to columns that have data
  const validCols = columns.filter((col) => rows.some((r) => r[col.key] !== undefined && r[col.key] !== null && r[col.key] !== ''));
  if (validCols.length === 0) return y;

  // Compute column widths
  const tableW = W - 2 * pad;
  const firstColW = Math.floor(tableW * 0.22); // Region/Name column wider
  const remainW = tableW - firstColW;
  const dataCols = validCols.length - 1;
  const dataColW = dataCols > 0 ? Math.floor(remainW / dataCols) : 0;

  // Header row (green background, white text)
  ctx.fillStyle = PY.tableHeader;
  ctx.fillRect(pad, y, tableW, headerH);

  ctx.font = 'bold 12px Arial';
  ctx.fillStyle = PY.white;
  let x = pad;
  for (let c = 0; c < validCols.length; c++) {
    const colW = c === 0 ? firstColW : dataColW;
    const headerLines = validCols[c].header.split('\n');
    if (validCols[c].numeric) {
      ctx.textAlign = 'center';
      const centerX = x + colW / 2;
      if (headerLines.length > 1) {
        ctx.fillText(headerLines[0], centerX, y + headerH / 2 - 4);
        ctx.fillText(headerLines[1], centerX, y + headerH / 2 + 12);
      } else {
        ctx.fillText(headerLines[0], centerX, y + headerH / 2 + 5);
      }
    } else {
      ctx.textAlign = 'left';
      ctx.fillText(headerLines[0], x + 12, y + headerH / 2 + 5);
    }
    x += colW;
  }
  ctx.textAlign = 'left';
  y += headerH;

  // Data rows
  for (let i = 0; i < rows.length; i++) {
    const isTotal = rows[i]['__isTotal'] === true || rows[i]['Region'] === 'TOTAL';
    ctx.fillStyle = isTotal ? PY.totalRow : (i % 2 === 0 ? PY.oddRow : PY.evenRow);
    ctx.fillRect(pad, y, tableW, rowH);

    // Bottom border
    ctx.fillStyle = '#E0E0E0';
    ctx.fillRect(pad, y + rowH - 1, tableW, 1);

    ctx.font = isTotal ? 'bold 13px Arial' : '13px Arial';
    ctx.fillStyle = PY.text;

    x = pad;
    for (let c = 0; c < validCols.length; c++) {
      const colW = c === 0 ? firstColW : dataColW;
      const val = String(rows[i][validCols[c].key] ?? '—');
      const displayVal = val.length > 28 ? val.slice(0, 27) + '…' : val;

      if (validCols[c].numeric) {
        ctx.textAlign = 'center';
        ctx.fillText(displayVal, x + colW / 2, y + rowH / 2 + 5);
      } else {
        ctx.textAlign = 'left';
        ctx.fillText(displayVal, x + 12, y + rowH / 2 + 5);
      }
      x += colW;
    }
    ctx.textAlign = 'left';
    y += rowH;
  }

  return y;
}

// ─── Layout: top_merchants ─────────────────────────────────────────────────

function renderTopMerchants(canvasLib: typeof import('canvas'), input: RenderInput): Buffer {
  const { createCanvas } = canvasLib;
  const ROW_H = 40;
  const HEADER_H = 100;
  const FOOTER_H = 44;
  const PAD = 16;
  const rows = input.rows.slice(0, 15);
  const H = HEADER_H + PAD + ROW_H + rows.length * ROW_H + PAD + FOOTER_H;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d') as unknown as CanvasCtx;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  drawHeader(ctx, input, HEADER_H);
  let y = HEADER_H + PAD;

  const cols = Object.keys(rows[0] ?? {});
  const rankW = 60;
  const dataW = W - 2 * PAD - rankW;

  // Compute dynamic widths for data columns
  const colWidths = computeColumnWidths(ctx, cols, rows, dataW, '14px Arial', 'bold 13px Arial');
  const numericCols = cols.map(col => isNumericColumn(col, rows));

  // Header row
  ctx.fillStyle = C.header;
  ctx.fillRect(0, y, W, ROW_H);
  ctx.font = 'bold 13px Arial';
  ctx.fillStyle = C.textOnGreen;
  ctx.fillText('#', PAD + 14, y + ROW_H / 2 + 5);
  let x = PAD + rankW;
  for (let c = 0; c < cols.length; c++) {
    const maxChars = Math.max(5, Math.floor(colWidths[c] / 8));
    const text = truncText(cols[c], maxChars);
    if (numericCols[c]) {
      ctx.textAlign = 'right';
      ctx.fillText(text, x + colWidths[c] - 6, y + ROW_H / 2 + 5);
    } else {
      ctx.textAlign = 'left';
      ctx.fillText(text, x + 4, y + ROW_H / 2 + 5);
    }
    x += colWidths[c];
  }
  ctx.textAlign = 'left';
  y += ROW_H;

  for (let i = 0; i < rows.length; i++) {
    const isTop3 = i < 3;
    ctx.fillStyle = isTop3 ? (i % 2 === 0 ? '#D4EDDA' : '#C3E6CB') : (i % 2 === 0 ? C.tableRow : C.tableRowAlt);
    ctx.fillRect(0, y, W, ROW_H);
    ctx.fillStyle = C.border;
    ctx.fillRect(0, y + ROW_H - 1, W, 1);

    // Rank number
    ctx.font = isTop3 ? 'bold 14px Arial' : '14px Arial';
    ctx.fillStyle = isTop3 ? C.header : C.text;
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), PAD + rankW / 2, y + ROW_H / 2 + 5);
    ctx.textAlign = 'left';

    ctx.font = isTop3 ? 'bold 14px Arial' : '14px Arial';
    ctx.fillStyle = C.text;
    x = PAD + rankW;
    for (let c = 0; c < cols.length; c++) {
      const maxChars = Math.max(5, Math.floor(colWidths[c] / 8));
      const text = truncText(fmtVal(rows[i][cols[c]]), maxChars);
      if (numericCols[c]) {
        ctx.textAlign = 'right';
        ctx.fillText(text, x + colWidths[c] - 6, y + ROW_H / 2 + 5);
      } else {
        ctx.textAlign = 'left';
        ctx.fillText(text, x + 4, y + ROW_H / 2 + 5);
      }
      x += colWidths[c];
    }
    ctx.textAlign = 'left';
    y += ROW_H;
  }

  if (input.truncated) {
    y += 8;
    ctx.font = '12px Arial';
    ctx.fillStyle = C.warning;
    ctx.fillText(`⚠ Truncated — showing top ${rows.length} rows`, PAD, y);
    y += 20;
  }

  drawFooter(ctx, y + PAD, FOOTER_H, input);
  return (canvas as unknown as { toBuffer(type: string): Buffer }).toBuffer('image/png');
}

// ─── Layout: region_summary ────────────────────────────────────────────────

function renderRegionSummary(canvasLib: typeof import('canvas'), input: RenderInput): Buffer {
  const { createCanvas } = canvasLib;
  const HEADER_H = 100;
  const FOOTER_H = 44;
  const PAD = 16;
  const CARD_H = 100;
  const rows = input.rows.slice(0, 20);
  const cols = rows.length > 0 ? Object.keys(rows[0]) : [];

  // Cards for each row (up to 3 per line)
  const cardRows = Math.ceil(rows.length / 3);
  const cardsH = cardRows * (CARD_H + 12);
  const ROW_H = 34;
  const tableH = rows.length > 0 ? ROW_H + rows.length * ROW_H + 8 : 0;
  const H = HEADER_H + PAD + cardsH + PAD + tableH + PAD + FOOTER_H;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d') as unknown as CanvasCtx;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  drawHeader(ctx, input, HEADER_H);
  let y = HEADER_H + PAD;

  // Region cards (one card per row from result)
  const cardW = Math.floor((W - PAD * 4) / 3);
  for (let i = 0; i < rows.length; i++) {
    const cardX = PAD + (i % 3) * (cardW + PAD);
    const cardY = y + Math.floor(i / 3) * (CARD_H + 12);
    ctx.fillStyle = C.surface;
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    roundRectStroke(ctx, cardX, cardY, cardW, CARD_H, 8);
    ctx.fillStyle = C.header;
    ctx.fillRect(cardX, cardY, cardW, 6);

    const region = String(rows[i][cols[0]] ?? `Row ${i + 1}`);
    ctx.font = 'bold 13px Arial';
    ctx.fillStyle = C.header;
    ctx.fillText(truncText(region, 18), cardX + 10, cardY + 24);

    if (cols.length > 1) {
      const v1 = fmtVal(rows[i][cols[1]]);
      ctx.font = 'bold 20px Arial';
      ctx.fillStyle = C.text;
      ctx.fillText(truncText(v1, 14), cardX + 10, cardY + 52);
      ctx.font = '11px Arial';
      ctx.fillStyle = C.textMuted;
      ctx.fillText(truncText(cols[1], 22), cardX + 10, cardY + 70);
    }
    if (cols.length > 2) {
      const v2 = fmtVal(rows[i][cols[2]]);
      ctx.font = '13px Arial';
      ctx.fillStyle = C.textMuted;
      ctx.fillText(`${truncText(cols[2], 12)}: ${truncText(v2, 12)}`, cardX + 10, cardY + 88);
    }
  }
  y += cardsH + PAD;

  // Full data table below cards
  if (cols.length > 0) {
    const SNO_W = 38;
    const colWidths = computeColumnWidths(ctx, cols, rows, W - 2 * PAD - SNO_W, '13px Arial', 'bold 12px Arial');
    drawTableBlock(ctx, cols, rows, colWidths, y, ROW_H, PAD, input.truncated ?? false);
  }

  y += tableH + PAD;
  drawFooter(ctx, y, FOOTER_H, input);
  return (canvas as unknown as { toBuffer(type: string): Buffer }).toBuffer('image/png');
}

// ─── Layout: merchant_summary ──────────────────────────────────────────────

function renderMerchantSummary(canvasLib: typeof import('canvas'), input: RenderInput): Buffer {
  const { createCanvas } = canvasLib;
  const HEADER_H = 100;
  const FOOTER_H = 44;
  const PAD = 16;
  const CARD_H = 110;
  const ROW_H = 34;
  const rows = input.rows.slice(0, 30);
  const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
  const metricCols = cols.filter(
    (c) => !['MerchantID', 'MerchantName', 'TID', 'merchant_id', 'name'].includes(c),
  );
  const cardsPerRow = Math.min(metricCols.length, 3);
  const cardW = Math.floor((W - PAD * (cardsPerRow + 1)) / cardsPerRow);
  const cardRows = Math.ceil(metricCols.length / 3);
  const cardsH = cardRows > 0 ? cardRows * (CARD_H + 12) : 0;
  const tableH = ROW_H + rows.length * ROW_H + 8;
  const H = HEADER_H + PAD + cardsH + PAD + tableH + PAD + FOOTER_H;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d') as unknown as CanvasCtx;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  drawHeader(ctx, input, HEADER_H);
  let y = HEADER_H + PAD;

  // Metric cards from first row
  if (rows.length > 0 && metricCols.length > 0) {
    for (let i = 0; i < metricCols.length; i++) {
      const col = metricCols[i];
      const cx = PAD + (i % 3) * (cardW + PAD);
      const cy = y + Math.floor(i / 3) * (CARD_H + 12);
      drawSingleMetricCard(ctx, col, fmtVal(rows[0][col]), cx, cy, cardW, CARD_H);
    }
    y += cardsH + PAD;
  }

  // Detail table
  if (cols.length > 0) {
    const SNO_W = 38;
    const colWidths = computeColumnWidths(ctx, cols, rows, W - 2 * PAD - SNO_W, '13px Arial', 'bold 12px Arial');
    drawTableBlock(ctx, cols, rows, colWidths, y, ROW_H, PAD, input.truncated ?? false);
  }
  y += tableH + PAD;
  drawFooter(ctx, y, FOOTER_H, input);
  return (canvas as unknown as { toBuffer(type: string): Buffer }).toBuffer('image/png');
}

// ─── Layout: terminal_summary ──────────────────────────────────────────────

function renderTerminalSummary(canvasLib: typeof import('canvas'), input: RenderInput): Buffer {
  // Same structure as merchant_summary — just different title semantics
  return renderMerchantSummary(canvasLib, input);
}

// ─── Layout: metric_card ──────────────────────────────────────────────────

function renderMetricCard(canvasLib: typeof import('canvas'), input: RenderInput): Buffer {
  const { createCanvas } = canvasLib;
  const HEADER_H = 100;
  const FOOTER_H = 44;
  const PAD = 20;
  const CARD_H = 130;

  const firstRow = input.rows[0] ?? {};
  const cols = Object.keys(firstRow).slice(0, 6);
  const cardsPerRow = Math.min(cols.length, 3);
  const cardW = cardsPerRow > 0 ? Math.floor((W - PAD * (cardsPerRow + 1)) / cardsPerRow) : W - 2 * PAD;
  const cardRowCount = Math.ceil(cols.length / 3);
  const H = HEADER_H + PAD + cardRowCount * (CARD_H + 16) + PAD + FOOTER_H;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d') as unknown as CanvasCtx;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  drawHeader(ctx, input, HEADER_H);
  const startY = HEADER_H + PAD;

  for (let i = 0; i < cols.length; i++) {
    const col = cols[i];
    const cx = PAD + (i % 3) * (cardW + PAD);
    const cy = startY + Math.floor(i / 3) * (CARD_H + 16);
    drawSingleMetricCard(ctx, col, fmtVal(firstRow[col]), cx, cy, cardW, CARD_H);
  }

  drawFooter(ctx, startY + cardRowCount * (CARD_H + 16) + PAD, FOOTER_H, input);
  return (canvas as unknown as { toBuffer(type: string): Buffer }).toBuffer('image/png');
}

// ─── Layout: comparison_table (generic) ───────────────────────────────────

function renderComparisonTable(canvasLib: typeof import('canvas'), input: RenderInput): Buffer {
  const { createCanvas } = canvasLib;
  const HEADER_H = 100;
  const FOOTER_H = 44;
  const FILTER_H = input.filters && Object.keys(input.filters).length > 0 ? 36 : 0;
  const ROW_H = 36;
  const PAD = 16;
  const rows = input.rows.slice(0, 50);
  const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
  const tableH = (rows.length + 1) * ROW_H + 12;
  const H = HEADER_H + FILTER_H + PAD + tableH + PAD + FOOTER_H;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d') as unknown as CanvasCtx;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  drawHeader(ctx, input, HEADER_H);
  let y = HEADER_H;

  if (FILTER_H > 0) {
    drawFiltersBar(ctx, input.filters!, y, FILTER_H);
    y += FILTER_H;
  }
  y += PAD;

  if (cols.length > 0) {
    const SNO_W = 38;
    const colWidths = computeColumnWidths(ctx, cols, rows, W - 2 * PAD - SNO_W, '13px Arial', 'bold 12px Arial');
    drawTableBlock(ctx, cols, rows, colWidths, y, ROW_H, PAD, input.truncated ?? false);
  }
  y += tableH + PAD;
  drawFooter(ctx, y, FOOTER_H, input);
  return (canvas as unknown as { toBuffer(type: string): Buffer }).toBuffer('image/png');
}

// ─── Layout: no_data ──────────────────────────────────────────────────────

function renderNoData(canvasLib: typeof import('canvas'), input: RenderInput): Buffer {
  const { createCanvas } = canvasLib;
  const HEADER_H = 100;
  const FOOTER_H = 44;
  const MSG_H = 180;
  const H = HEADER_H + MSG_H + FOOTER_H;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d') as unknown as CanvasCtx;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  drawHeader(ctx, input, HEADER_H);

  // No-data message
  const msgY = HEADER_H + MSG_H / 2;
  ctx.font = 'bold 22px Arial';
  ctx.fillStyle = C.textMuted;
  ctx.textAlign = 'center';
  ctx.fillText('No data found for selected filters', W / 2, msgY - 16);

  ctx.font = '14px Arial';
  ctx.fillStyle = C.textMuted;
  const filterStr = input.filters
    ? Object.entries(input.filters).map(([k, v]) => `${k}: ${v}`).join('  |  ')
    : input.dateRange;
  ctx.fillText(truncText(filterStr, 80), W / 2, msgY + 16);
  ctx.textAlign = 'left';

  drawFooter(ctx, HEADER_H + MSG_H, FOOTER_H, input);
  return (canvas as unknown as { toBuffer(type: string): Buffer }).toBuffer('image/png');
}

// ─── Shared drawing helpers ────────────────────────────────────────────────

function drawHeader(ctx: CanvasCtx, input: RenderInput, H: number): void {
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, C.header);
  grad.addColorStop(1, C.accentMid);
  ctx.fillStyle = grad as unknown as string;
  ctx.fillRect(0, 0, W, H);

  ctx.font = 'bold 12px Arial';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('TAPSYS · NBP', 24, 24);

  ctx.font = 'bold 24px Arial';
  ctx.fillStyle = C.white;
  ctx.fillText(truncText(input.reportTitle, 55), 24, 60);

  const tz = input.timezone ?? 'Asia/Karachi';
  const now = new Date().toLocaleString('en-PK', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' });
  ctx.font = '12px Arial';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(`${input.dateRange}  ·  Generated ${now}`, 24, 84);

  // Row badge
  if (input.rowCount !== undefined || input.rows.length > 0) {
    const badge = `${input.rowCount ?? input.rows.length} rows${input.truncated ? ' ✂' : ''}`;
    ctx.font = '11px Arial';
    const bw = ctx.measureText(badge).width + 20;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(ctx, W - bw - 16, H - 34, bw, 22, 5);
    ctx.fillStyle = C.white;
    ctx.textAlign = 'center';
    ctx.fillText(badge, W - bw / 2 - 16, H - 18);
    ctx.textAlign = 'left';
  }
}

function drawFooter(ctx: CanvasCtx, y: number, H: number, input: RenderInput): void {
  ctx.fillStyle = C.surface;
  ctx.fillRect(0, y, W, H);
  ctx.font = '11px Arial';
  ctx.fillStyle = C.textMuted;
  ctx.fillText('TAPSYS Reporting Bot  ·  Paysys Labs — NBP', 16, y + H / 2 + 4);
  ctx.textAlign = 'right';
  ctx.fillText('Confidential — Internal Use Only', W - 16, y + H / 2 + 4);
  ctx.textAlign = 'left';
  void input;
}

function drawFiltersBar(ctx: CanvasCtx, filters: Record<string, string>, y: number, H: number): void {
  ctx.fillStyle = C.surface;
  ctx.fillRect(0, y, W, H);
  ctx.fillStyle = C.border;
  ctx.fillRect(0, y, W, 1);
  const parts = Object.entries(filters).map(([k, v]) => `${k}: ${v}`);
  ctx.font = '11px Arial';
  ctx.fillStyle = C.textMuted;
  ctx.fillText('Filters: ' + parts.join('  |  '), 16, y + H / 2 + 4);
}

function drawKpiCards(ctx: CanvasCtx, totalRow: Record<string, unknown>, startY: number): number {
  const kpiKeys = [
    'Sale Volume Yesterday', 'Yesterday Count', 'Sale Volume MTD',
    'MTD Count', 'Active Merchants (30d)', 'Active Terminals (30d)',
  ];
  const available = kpiKeys.filter((k) => totalRow[k] !== undefined && totalRow[k] !== null);
  const perRow = 3;
  const CARD_H = 110;
  const PAD = 16;
  const cardW = Math.floor((W - PAD * (perRow + 1)) / perRow);
  let y = startY;

  for (let i = 0; i < available.length; i++) {
    const k = available[i];
    const cx = PAD + (i % perRow) * (cardW + PAD);
    const cy = y + Math.floor(i / perRow) * (CARD_H + 12);
    drawSingleMetricCard(ctx, k, String(totalRow[k] ?? '—'), cx, cy, cardW, CARD_H);
  }

  const rows = Math.ceil(available.length / perRow);
  return startY + rows * (CARD_H + 12);
}

function drawSingleMetricCard(
  ctx: CanvasCtx,
  label: string,
  value: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.fillStyle = C.surface;
  roundRect(ctx, x, y, w, h, 8);
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect?.(x, y, w, h, 8);
  ctx.stroke();

  // Green accent bar top
  ctx.fillStyle = C.header;
  ctx.fillRect(x, y, w, 5);

  ctx.font = 'bold 22px Arial';
  ctx.fillStyle = C.text;
  ctx.fillText(truncText(value, Math.floor(w / 11)), x + 12, y + 50);

  ctx.font = '11px Arial';
  ctx.fillStyle = C.textMuted;
  ctx.fillText(truncText(label, Math.floor(w / 7)), x + 12, y + 72);
}

function drawSection(
  ctx: CanvasCtx,
  title: string,
  cols: string[],
  rows: Record<string, unknown>[],
  startY: number,
  rowH: number,
  pad: number,
  rankNumbers = false,
): number {
  const TITLE_H = 42;
  let y = startY;

  // Section title bar
  ctx.fillStyle = C.surface;
  ctx.fillRect(0, y, W, TITLE_H);
  ctx.fillStyle = C.header;
  ctx.fillRect(0, y, 5, TITLE_H);
  ctx.font = 'bold 15px Arial';
  ctx.fillStyle = C.header;
  ctx.fillText(title, 16, y + TITLE_H / 2 + 6);
  y += TITLE_H;

  // Filter to cols that exist in rows
  const validCols = cols.filter((c) => rows.some((r) => r[c] !== undefined));
  if (validCols.length === 0) return y;

  const rankW = rankNumbers ? 44 : 0;
  const dataW = W - 2 * pad - rankW;

  // Compute dynamic column widths
  const colWidths = computeColumnWidths(ctx, validCols, rows, dataW, '13px Arial', 'bold 12px Arial');
  const numericCols = validCols.map(col => isNumericColumn(col, rows));

  // Column header row
  ctx.fillStyle = C.header;
  ctx.fillRect(0, y, W, rowH);
  ctx.font = 'bold 12px Arial';
  ctx.fillStyle = C.textOnGreen;
  if (rankNumbers) {
    ctx.textAlign = 'center';
    ctx.fillText('#', pad + rankW / 2, y + rowH / 2 + 5);
    ctx.textAlign = 'left';
  }
  let x = pad + rankW;
  for (let c = 0; c < validCols.length; c++) {
    const maxChars = Math.max(5, Math.floor(colWidths[c] / 7));
    const text = truncText(validCols[c], maxChars);
    if (numericCols[c]) {
      ctx.textAlign = 'right';
      ctx.fillText(text, x + colWidths[c] - 6, y + rowH / 2 + 5);
    } else {
      ctx.textAlign = 'left';
      ctx.fillText(text, x + 4, y + rowH / 2 + 5);
    }
    x += colWidths[c];
  }
  ctx.textAlign = 'left';
  y += rowH;

  // Data rows
  for (let i = 0; i < rows.length; i++) {
    const isTotal = rows[i]['Aggregator'] === 'TOTAL' || rows[i]['Region'] === 'ALL' || rows[i]['Region'] === 'TOTAL' || rows[i]['__isTotal'] === true;
    ctx.fillStyle = isTotal ? C.totalRow : (i % 2 === 0 ? C.tableRow : C.tableRowAlt);
    ctx.fillRect(0, y, W, rowH);
    ctx.fillStyle = C.border;
    ctx.fillRect(0, y + rowH - 1, W, 1);

    ctx.font = isTotal ? 'bold 13px Arial' : '13px Arial';
    ctx.fillStyle = C.text;

    if (rankNumbers) {
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), pad + rankW / 2, y + rowH / 2 + 5);
      ctx.textAlign = 'left';
    }
    x = pad + rankW;
    for (let c = 0; c < validCols.length; c++) {
      const maxChars = Math.max(5, Math.floor(colWidths[c] / 7));
      const text = truncText(fmtVal(rows[i][validCols[c]]), maxChars);
      if (numericCols[c]) {
        ctx.textAlign = 'right';
        ctx.fillText(text, x + colWidths[c] - 6, y + rowH / 2 + 5);
      } else {
        ctx.textAlign = 'left';
        ctx.fillText(text, x + 4, y + rowH / 2 + 5);
      }
      x += colWidths[c];
    }
    ctx.textAlign = 'left';
    y += rowH;
  }
  y += 8;
  return y;
}

function drawTableBlock(
  ctx: CanvasCtx,
  cols: string[],
  rows: Record<string, unknown>[],
  colWidths: number[],
  startY: number,
  rowH: number,
  pad: number,
  truncated: boolean,
): void {
  let y = startY;
  const numericCols = cols.map(col => isNumericColumn(col, rows));
  const SNO_W = 38; // serial number column width

  // Header row
  ctx.fillStyle = C.header;
  ctx.fillRect(0, y, W, rowH);
  ctx.font = 'bold 12px Arial';
  ctx.fillStyle = C.textOnGreen;

  // S.No header
  ctx.textAlign = 'center';
  ctx.fillText('#', pad + SNO_W / 2, y + rowH / 2 + 5);

  let x = pad + SNO_W;
  for (let c = 0; c < cols.length; c++) {
    const maxChars = Math.max(5, Math.floor(colWidths[c] / 7));
    const text = truncText(cols[c], maxChars);
    if (numericCols[c]) {
      ctx.textAlign = 'right';
      ctx.fillText(text, x + colWidths[c] - 6, y + rowH / 2 + 5);
    } else {
      ctx.textAlign = 'left';
      ctx.fillText(text, x + 4, y + rowH / 2 + 5);
    }
    x += colWidths[c];
  }
  ctx.textAlign = 'left';
  y += rowH;

  // Data rows
  ctx.font = '13px Arial';
  for (let r = 0; r < rows.length; r++) {
    ctx.fillStyle = r % 2 === 0 ? C.tableRow : C.tableRowAlt;
    ctx.fillRect(0, y, W, rowH);
    ctx.fillStyle = C.border;
    ctx.fillRect(0, y + rowH - 1, W, 1);
    ctx.fillStyle = C.text;

    // S.No value
    ctx.textAlign = 'center';
    ctx.fillText(String(r + 1), pad + SNO_W / 2, y + rowH / 2 + 5);

    x = pad + SNO_W;
    for (let c = 0; c < cols.length; c++) {
      const maxChars = Math.max(5, Math.floor(colWidths[c] / 7));
      const text = truncText(fmtVal(rows[r][cols[c]]), maxChars);
      if (numericCols[c]) {
        ctx.textAlign = 'right';
        ctx.fillText(text, x + colWidths[c] - 6, y + rowH / 2 + 5);
      } else {
        ctx.textAlign = 'left';
        ctx.fillText(text, x + 4, y + rowH / 2 + 5);
      }
      x += colWidths[c];
    }
    ctx.textAlign = 'left';
    y += rowH;
  }

  if (truncated) {
    ctx.font = '11px Arial';
    ctx.fillStyle = C.warning;
    ctx.fillText(`⚠ Truncated — showing first ${rows.length} rows`, pad, y + 18);
  }
}

function roundRect(ctx: CanvasCtx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function roundRectStroke(ctx: CanvasCtx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function fmtVal(val: unknown): string {
  if (val === null || val === undefined) return '—';

  // Handle Date objects
  if (val instanceof Date) {
    if (val.getHours() === 0 && val.getMinutes() === 0 && val.getSeconds() === 0) {
      // Date-only (no meaningful time component)
      return val.toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: '2-digit' });
    }
    return val.toLocaleString('en-PK', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  // Handle ISO date strings (e.g. "2026-04-29T00:00:00.000Z" or "2026-04-29")
  if (typeof val === 'string') {
    const isoDateMatch = val.match(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/);
    if (isoDateMatch) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        if (!isoDateMatch[1] || (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0)) {
          return d.toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: '2-digit' });
        }
        return d.toLocaleString('en-PK', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      }
    }
  }

  const n = typeof val === 'number' ? val : Number(String(val).replace(/,/g, ''));
  if (!isNaN(n) && typeof val === 'number') {
    if (Number.isInteger(n)) return n.toLocaleString('en-PK');
    return n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return String(val);
}

function truncText(text: string, maxChars: number): string {
  if (maxChars < 1) maxChars = 5;
  return text.length > maxChars ? text.slice(0, maxChars - 1) + '…' : text;
}

/**
 * Computes dynamic column widths based on actual text content.
 * Uses ctx.measureText() to size columns proportionally, with min/max constraints.
 */
function computeColumnWidths(
  ctx: CanvasCtx,
  cols: string[],
  rows: Record<string, unknown>[],
  availableWidth: number,
  font: string,
  headerFont: string,
): number[] {
  const MIN_COL_W = 55;
  const MAX_COL_W = 320;
  const CELL_PAD = 14; // internal cell padding

  // Measure header widths
  ctx.font = headerFont;
  const headerWidths = cols.map(c => ctx.measureText(c).width + CELL_PAD);

  // Measure data widths (sample first 15 rows for performance)
  ctx.font = font;
  const sampleRows = rows.slice(0, 15);
  const dataWidths = cols.map((col, ci) => {
    let maxW = headerWidths[ci];
    for (const row of sampleRows) {
      const val = fmtVal(row[col]);
      const w = ctx.measureText(val).width + CELL_PAD;
      if (w > maxW) maxW = w;
    }
    return maxW;
  });

  // Clamp to min/max
  const clamped = dataWidths.map(w => Math.max(MIN_COL_W, Math.min(MAX_COL_W, w)));

  // Scale to fit available width
  const totalNatural = clamped.reduce((a, b) => a + b, 0);
  if (totalNatural <= availableWidth) {
    // Distribute extra space proportionally
    const extra = availableWidth - totalNatural;
    return clamped.map(w => w + (extra * w / totalNatural));
  } else {
    // Shrink proportionally but keep minimums
    const scale = availableWidth / totalNatural;
    return clamped.map(w => Math.max(MIN_COL_W, w * scale));
  }
}

/** Determines if a column likely contains numeric data */
function isNumericColumn(col: string, rows: Record<string, unknown>[]): boolean {
  let numCount = 0;
  const sample = rows.slice(0, 10);
  for (const row of sample) {
    const v = row[col];
    if (v === null || v === undefined) continue;
    if (typeof v === 'number') { numCount++; continue; }
    if (!isNaN(Number(String(v).replace(/,/g, '')))) numCount++;
  }
  return numCount > sample.length * 0.5;
}

// ─── Text fallback ─────────────────────────────────────────────────────────

function buildTextFallback(input: RenderInput): string {
  const lines: string[] = [];
  lines.push(`📊 *${input.reportTitle}*`);
  lines.push(`📅 ${input.dateRange}`);
  if (input.filters && Object.keys(input.filters).length > 0) {
    const f = Object.entries(input.filters).map(([k, v]) => `${k}=${v}`).join(', ');
    lines.push(`🔍 Filters: ${f}`);
  }
  lines.push('');

  const rows = input.rows.slice(0, 20);
  if (rows.length === 0) {
    lines.push('_No data found._');
  } else {
    const cols = Object.keys(rows[0]);
    lines.push(cols.join(' | '));
    lines.push(cols.map((c) => '-'.repeat(Math.max(c.length, 3))).join('-+-'));
    for (const row of rows) lines.push(cols.map((c) => fmtVal(row[c])).join(' | '));
    if (input.truncated) lines.push(`\n⚠ Showing ${rows.length} of ${input.rowCount} rows`);
  }

  const tz = input.timezone ?? 'Asia/Karachi';
  lines.push(`\n_Generated: ${new Date().toLocaleString('en-PK', { timeZone: tz })}_`);
  return lines.join('\n');
}
