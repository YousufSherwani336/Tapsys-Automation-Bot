/**
 * Tool: data_reporting.render_excel
 * Accepts query result rows and metadata, generates an Excel (.xlsx) file,
 * saves it to disk, and returns the file path + caption string.
 *
 * Supports two-section layout: summaryRows on top, then detail rows below.
 * If detail rows exceed the sheet limit, overflow goes to additional sheets.
 *
 * Supports resultRef: when execute_sql returns a resultRef for large results,
 * pass it here to pull full data from the in-memory store (avoids sending
 * thousands of rows through the LLM context).
 */

import { z } from 'zod';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { ToolDefinition } from '../../../types/index.js';
import type { AuditLogger } from '../lib/auditLogger.js';
import { getStoredResult } from '../lib/resultStore.js';

const MAX_ROWS_PER_SHEET = 1_000_000; // Excel limit is ~1,048,576

export const RenderExcelInput = z.object({
  rows: z
    .array(z.record(z.unknown()))
    .optional()
    .describe('Detail/transaction rows. Can be empty/omitted if detailResultRef is provided.'),
  detailResultRef: z
    .string()
    .optional()
    .describe('Reference ID from execute_sql for the detail data. When provided, full rows are pulled from the internal store — pass this instead of rows for large datasets.'),
  summaryRows: z
    .array(z.record(z.unknown()))
    .optional()
    .describe('Optional summary rows rendered at the TOP of the sheet with a separate header.'),
  summaryResultRef: z
    .string()
    .optional()
    .describe('Reference ID from execute_sql for the summary data. When provided, pulls from store.'),
  reportTitle: z
    .string()
    .describe('Report title used as the Excel sheet name and file name prefix.'),
  dateRange: z
    .string()
    .describe('Human-readable date range label e.g. "Since Inception".'),
  filters: z
    .record(z.string())
    .optional()
    .describe('Applied filters shown in the Excel header row.'),
  caption: z
    .string()
    .optional()
    .describe('Short caption to accompany the WhatsApp document message.'),
  hideColumns: z
    .array(z.string())
    .optional()
    .describe('Column keys to exclude from the detail rows output.'),
});

export type RenderExcelInputType = z.infer<typeof RenderExcelInput>;

export interface RenderExcelResult {
  success: boolean;
  excelPath: string | null;
  fileName: string;
  caption: string;
  rowCount: number;
  sheetCount: number;
  error?: string;
}

function applyHideColumns(
  rows: Record<string, unknown>[],
  hideColumns?: string[],
): Record<string, unknown>[] {
  if (!hideColumns || hideColumns.length === 0) return rows;
  const hide = new Set(hideColumns.map((c) => c.toLowerCase()));
  return rows.map((row) => {
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (!hide.has(key.toLowerCase())) {
        filtered[key] = value;
      }
    }
    return filtered;
  });
}

function styleHeaderRow(sheet: any, rowNum: number, colCount: number, color: string): void {
  const headerRow = sheet.getRow(rowNum);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: color },
  };
  headerRow.alignment = { horizontal: 'center' };
  headerRow.eachCell((cell: any) => {
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };
  });
}

export function buildRenderExcelTool(
  audit: AuditLogger,
  from: string,
  outputDir: string,
): ToolDefinition<RenderExcelInputType, RenderExcelResult> {
  return {
    name: 'data_reporting.render_excel',
    description:
      'Renders query result rows into an Excel (.xlsx) file with optional summary section on top. ' +
      'Pass detailResultRef (from execute_sql) to use full stored data instead of rows. ' +
      'Pass summaryResultRef or summaryRows for the top summary table. ' +
      'If detail rows exceed 1M, overflow goes to Sheet 2, 3, etc. ' +
      'Returns the local file path and file name for WhatsApp document sending.',
    inputSchema: RenderExcelInput,
    handler: async (input) => {
      try {
        const excelMod = await import('exceljs');
        const ExcelJS = excelMod.default ?? excelMod;

        // Resolve detail rows: prefer resultRef over inline rows
        let rawDetailRows: Record<string, unknown>[] = [];
        if (input.detailResultRef) {
          const stored = getStoredResult(input.detailResultRef);
          if (stored) {
            rawDetailRows = stored.rows;
          } else {
            return {
              success: false,
              excelPath: null,
              fileName: '',
              caption: '',
              rowCount: 0,
              sheetCount: 0,
              error: 'Detail resultRef expired or not found. Please re-run the query.',
            };
          }
        } else if (input.rows && input.rows.length > 0) {
          rawDetailRows = input.rows;
        }

        // Resolve summary rows: prefer resultRef over inline
        let summaryRows: Record<string, unknown>[] = [];
        if (input.summaryResultRef) {
          const stored = getStoredResult(input.summaryResultRef);
          if (stored) {
            summaryRows = stored.rows;
          }
        } else if (input.summaryRows && input.summaryRows.length > 0) {
          summaryRows = input.summaryRows;
        }

        // Apply hideColumns to detail rows
        let detailRows = applyHideColumns(rawDetailRows, input.hideColumns);

        if (detailRows.length === 0 && summaryRows.length === 0) {
          return {
            success: false,
            excelPath: null,
            fileName: '',
            caption: '',
            rowCount: 0,
            sheetCount: 0,
            error: 'No data rows to export.',
          };
        }

        // Build workbook
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'TAPSYS Report Bot';
        workbook.created = new Date();

        const safeSheetName = (input.reportTitle
          .replace(/[\\/*?[\]:]/g, '')
          .slice(0, 31)) || 'Report';

        let sheetCount = 0;

        // ── SHEET 1: Summary + first batch of detail rows ──
        const sheet1 = workbook.addWorksheet(safeSheetName);
        sheetCount++;

        let currentRow = 1;

        // ── SUMMARY SECTION (if provided) ──
        if (summaryRows.length > 0) {
          const summaryCols = Object.keys(summaryRows[0]);

          // Set columns for summary section
          for (let colIdx = 0; colIdx < summaryCols.length; colIdx++) {
            const col = summaryCols[colIdx];
            const cell = sheet1.getCell(currentRow, colIdx + 1);
            cell.value = col;
          }
          styleHeaderRow(sheet1, currentRow, summaryCols.length, 'FF1F4E79');
          currentRow++;

          // Summary data rows
          for (const sRow of summaryRows) {
            for (let colIdx = 0; colIdx < summaryCols.length; colIdx++) {
              const cell = sheet1.getCell(currentRow, colIdx + 1);
              cell.value = sRow[summaryCols[colIdx]] as any ?? '';
            }
            currentRow++;
          }

          // Add 2 blank rows between summary and detail
          currentRow += 2;
        }

        // ── DETAIL SECTION ──
        if (detailRows.length > 0) {
          const detailCols = Object.keys(detailRows[0]);

          // Set column widths based on detail headers
          sheet1.columns = detailCols.map((col) => ({
            width: Math.max(col.length + 2, 14),
          }));

          // Detail header row
          const detailHeaderRowNum = currentRow;
          for (let colIdx = 0; colIdx < detailCols.length; colIdx++) {
            const cell = sheet1.getCell(currentRow, colIdx + 1);
            cell.value = detailCols[colIdx];
          }
          styleHeaderRow(sheet1, currentRow, detailCols.length, 'FF4472C4');
          currentRow++;

          // Calculate how many rows fit on sheet 1
          const remainingOnSheet1 = MAX_ROWS_PER_SHEET - currentRow;
          const firstBatchSize = Math.min(detailRows.length, remainingOnSheet1);

          // Add first batch of detail rows to sheet 1
          for (let i = 0; i < firstBatchSize; i++) {
            const row = detailRows[i];
            for (let colIdx = 0; colIdx < detailCols.length; colIdx++) {
              const cell = sheet1.getCell(currentRow, colIdx + 1);
              cell.value = row[detailCols[colIdx]] as any ?? '';
            }
            currentRow++;
          }

          // Auto-filter on detail header
          sheet1.autoFilter = {
            from: { row: detailHeaderRowNum, column: 1 },
            to: { row: detailHeaderRowNum, column: detailCols.length },
          };

          // ── OVERFLOW SHEETS (if detail rows exceed sheet 1 capacity) ──
          let offset = firstBatchSize;
          while (offset < detailRows.length) {
            sheetCount++;
            const overflowSheet = workbook.addWorksheet(
              `${safeSheetName.slice(0, 25)} (${sheetCount})`,
            );

            // Header row on overflow sheet
            overflowSheet.columns = detailCols.map((col) => ({
              header: col,
              key: col,
              width: Math.max(col.length + 2, 14),
            }));
            styleHeaderRow(overflowSheet, 1, detailCols.length, 'FF4472C4');

            const batchSize = Math.min(detailRows.length - offset, MAX_ROWS_PER_SHEET - 1);
            for (let i = 0; i < batchSize; i++) {
              const row = detailRows[offset + i];
              const values: Record<string, unknown> = {};
              for (const col of detailCols) {
                values[col] = row[col] ?? '';
              }
              overflowSheet.addRow(values);
            }

            // Auto-filter on overflow
            overflowSheet.autoFilter = {
              from: { row: 1, column: 1 },
              to: { row: 1, column: detailCols.length },
            };

            offset += batchSize;
          }
        }

        // Save to file
        await mkdir(outputDir, { recursive: true });
        const timestamp = Date.now();
        const safeTitle = input.reportTitle
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .slice(0, 40);
        const fileName = `${safeTitle}_${timestamp}.xlsx`;
        const filePath = join(outputDir, fileName);

        await workbook.xlsx.writeFile(filePath);

        const totalRows = detailRows.length + summaryRows.length;
        const caption = input.caption ?? `${input.reportTitle} — ${input.dateRange}`;

        await audit.log({
          from,
          action: 'render_excel',
          queryDescription: input.reportTitle,
          rowsReturned: totalRows,
          status: 'ok',
        });

        return {
          success: true,
          excelPath: filePath,
          fileName,
          caption,
          rowCount: totalRows,
          sheetCount,
        };
      } catch (err) {
        await audit.log({
          from,
          action: 'render_excel',
          status: 'error',
          reason: (err as Error).message,
        });
        return {
          success: false,
          excelPath: null,
          fileName: '',
          caption: '',
          rowCount: 0,
          sheetCount: 0,
          error: `Failed to generate Excel: ${(err as Error).message}`,
        };
      }
    },
  };
}
