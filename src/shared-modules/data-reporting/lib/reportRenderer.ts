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

// ─── Layout: full_dashboard ────────────────────────────────────────────────

function renderFullDashboard(canvasLib: typeof import('canvas'), input: RenderInput): Buffer {
  const { createCanvas } = canvasLib;

  const hasRowType = input.rows.length > 0 && 'RowType' in input.rows[0];
  if (!hasRowType) return renderComparisonTable(canvasLib, input);

  const summaryRows = input.rows.filter((r) => r['RowType'] === 'SUMMARY');
  const totalRow = summaryRows.find((r) => r['Aggregator'] === 'TOTAL');
  const regionRows = summaryRows.filter((r) => r['Aggregator'] !== 'TOTAL');
  const merchantRows = input.rows.filter((r) => r['RowType'] === 'MERCHANT');

  const ROW_H = 36;
  const SECT_TITLE_H = 42;
  const HEADER_H = 120;
  const FOOTER_H = 44;
  const PAD = 20;

  const kpiH = totalRow ? 140 : 0;
  const txnTableH = regionRows.length > 0 ? SECT_TITLE_H + ROW_H + regionRows.length * ROW_H + 12 : 0;
  const growthTableH = regionRows.length > 0 ? SECT_TITLE_H + ROW_H + regionRows.length * ROW_H + 12 : 0;
  const merchTableH = merchantRows.length > 0 ? SECT_TITLE_H + ROW_H + merchantRows.length * ROW_H + 12 : 0;
  const H = HEADER_H + PAD + kpiH + txnTableH + PAD + growthTableH + PAD + merchTableH + PAD + FOOTER_H;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d') as unknown as CanvasCtx;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  drawHeader(ctx, input, HEADER_H);
  let y = HEADER_H + PAD;

  if (totalRow) {
    y = drawKpiCards(ctx, totalRow, y);
    y += PAD;
  }

  if (regionRows.length > 0) {
    const txnCols = ['Region', 'Yesterday Count', 'Sale Volume Yesterday', 'MTD Count', 'Sale Volume MTD'];
    y = drawSection(ctx, 'Transaction Performance', txnCols, [...regionRows, ...(totalRow ? [totalRow] : [])], y, ROW_H, PAD);
    y += PAD;

    const growthCols = ['Region', 'Merchants Added Yesterday', 'Terminals Added Yesterday', 'Active Merchants (30d)', 'Active Terminals (30d)', 'Active Merchant %', 'Active Terminal %'];
    y = drawSection(ctx, 'System Growth & Active Base', growthCols, [...regionRows, ...(totalRow ? [totalRow] : [])], y, ROW_H, PAD);
    y += PAD;
  }

  if (merchantRows.length > 0) {
    const mCols = ['Merchant Name', 'Merchant Txn Count', 'Merchant Txn Amount'];
    y = drawSection(ctx, 'Top Merchants (MTD)', mCols, merchantRows, y, ROW_H, PAD, true);
    y += PAD;
  }

  drawFooter(ctx, y, FOOTER_H, input);
  return (canvas as unknown as { toBuffer(type: string): Buffer }).toBuffer('image/png');
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

  // Header row with rank column
  const cols = Object.keys(rows[0] ?? {});
  const rankW = 60;
  const dataW = W - 2 * PAD - rankW;
  const colW = cols.length > 0 ? Math.floor(dataW / cols.length) : 80;

  ctx.fillStyle = C.header;
  ctx.fillRect(0, y, W, ROW_H);
  ctx.font = 'bold 13px Arial';
  ctx.fillStyle = C.textOnGreen;
  ctx.fillText('#', PAD + 14, y + ROW_H / 2 + 5);
  let x = PAD + rankW;
  for (const col of cols) {
    ctx.fillText(truncText(col, Math.floor(colW / 7)), x, y + ROW_H / 2 + 5);
    x += colW;
  }
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

    x = PAD + rankW;
    for (const col of cols) {
      ctx.fillText(truncText(fmtVal(rows[i][col]), Math.floor(colW / 7)), x, y + ROW_H / 2 + 5);
      x += colW;
    }
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
    const colW = Math.max(Math.floor((W - 2 * PAD) / cols.length), 60);
    const colWidths = cols.map(() => colW);
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
    const colW = Math.max(Math.floor((W - 2 * PAD) / cols.length), 60);
    drawTableBlock(ctx, cols, rows, cols.map(() => colW), y, ROW_H, PAD, input.truncated ?? false);
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
    const colW = Math.max(Math.floor((W - 2 * PAD) / cols.length), 60);
    drawTableBlock(ctx, cols, rows, cols.map(() => colW), y, ROW_H, PAD, input.truncated ?? false);
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
  const colW = Math.max(Math.floor(dataW / validCols.length), 60);

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
  for (const col of validCols) {
    ctx.fillText(truncText(col, Math.floor(colW / 7)), x, y + rowH / 2 + 5);
    x += colW;
  }
  y += rowH;

  // Data rows
  for (let i = 0; i < rows.length; i++) {
    const isTotal = rows[i]['Aggregator'] === 'TOTAL' || rows[i]['Region'] === 'ALL';
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
    for (const col of validCols) {
      ctx.fillText(truncText(fmtVal(rows[i][col]), Math.floor(colW / 7)), x, y + rowH / 2 + 5);
      x += colW;
    }
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

  ctx.fillStyle = C.header;
  ctx.fillRect(0, y, W, rowH);
  ctx.font = 'bold 12px Arial';
  ctx.fillStyle = C.textOnGreen;
  let x = pad;
  for (let c = 0; c < cols.length; c++) {
    ctx.fillText(truncText(cols[c], Math.floor(colWidths[c] / 7)), x, y + rowH / 2 + 5);
    x += colWidths[c];
  }
  y += rowH;

  ctx.font = '13px Arial';
  for (let r = 0; r < rows.length; r++) {
    ctx.fillStyle = r % 2 === 0 ? C.tableRow : C.tableRowAlt;
    ctx.fillRect(0, y, W, rowH);
    ctx.fillStyle = C.border;
    ctx.fillRect(0, y + rowH - 1, W, 1);
    ctx.fillStyle = C.text;
    x = pad;
    for (let c = 0; c < cols.length; c++) {
      ctx.fillText(truncText(fmtVal(rows[r][cols[c]]), Math.floor(colWidths[c] / 7)), x, y + rowH / 2 + 5);
      x += colWidths[c];
    }
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
