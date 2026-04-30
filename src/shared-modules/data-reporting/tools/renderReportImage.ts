/**
 * Tool: data_reporting.render_report
 * Accepts query result rows and metadata, renders a PNG image, saves it to disk,
 * and returns the image path + caption string.
 */

import { z } from 'zod';
import type { ToolDefinition } from '../../../types/index.js';
import { ReportRenderer } from '../lib/reportRenderer.js';
import type { RenderType } from '../lib/reportRenderer.js';
import type { AuditLogger } from '../lib/auditLogger.js';

export const RenderReportInput = z.object({
  rows: z
    .array(z.record(z.unknown()))
    .describe('Query result rows returned by execute_sql.'),
  reportTitle: z
    .string()
    .describe('Report title shown in the image header.'),
  dateRange: z
    .string()
    .describe('Human-readable date range label e.g. "Yesterday (2025-01-14)".'),
  filters: z
    .record(z.string())
    .optional()
    .describe('Applied filters shown in the image.'),
  renderType: z
    .enum([
      'full_dashboard',
      'top_merchants',
      'region_summary',
      'merchant_summary',
      'terminal_summary',
      'metric_card',
      'comparison_table',
      'no_data',
      // legacy aliases kept for backwards compatibility
      'dashboard',
      'table',
      'metric_cards',
    ])
    .optional()
    .describe(
      'Image layout type. Use "full_dashboard" for regional+merchant NBP report, ' +
      '"top_merchants" for ranked merchant list, "region_summary" for region table, ' +
      '"merchant_summary" for single merchant detail, "terminal_summary" for TID detail, ' +
      '"metric_card" for KPI summary cards, "comparison_table" for generic tabular data. ' +
      'Defaults to "comparison_table".',
    ),
  rowCount: z
    .number()
    .optional()
    .describe('Total rows before truncation.'),
  truncated: z
    .boolean()
    .optional()
    .describe('Whether the rows were truncated to maxRows limit.'),
  caption: z
    .string()
    .optional()
    .describe('Short caption to accompany the WhatsApp image message.'),
});

export type RenderReportInputType = z.infer<typeof RenderReportInput>;

export interface RenderReportResult {
  success: boolean;
  imagePath: string | null;
  caption: string;
  textFallback: string;
  error?: string;
}

export function buildRenderReportTool(
  renderer: ReportRenderer,
  audit: AuditLogger,
  from: string,
  outputDir: string,
  timezone: string,
): ToolDefinition<RenderReportInputType, RenderReportResult> {
  return {
    name: 'data_reporting.render_report',
    description:
      'Renders query result rows into a PNG report image. ' +
      'Returns the local image file path and a short caption for WhatsApp.',
    inputSchema: RenderReportInput,
    handler: async (input) => {
      try {
        const result = await renderer.render({
          rows: input.rows,
          reportTitle: input.reportTitle,
          dateRange: input.dateRange,
          filters: input.filters,
          renderType: (input.renderType as RenderType) ?? 'comparison_table',
          truncated: input.truncated ?? false,
          rowCount: input.rowCount ?? input.rows.length,
          outputDir,
          timezone,
        });

        const caption = input.caption ?? `${input.reportTitle} — ${input.dateRange}`;

        await audit.log({
          from,
          action: 'render_report',
          queryDescription: input.reportTitle,
          rowsReturned: input.rows.length,
          status: 'ok',
        });

        return {
          success: true,
          imagePath: result.imagePath,
          caption,
          textFallback: result.textFallback,
        };
      } catch (err) {
        await audit.log({
          from,
          action: 'render_report',
          status: 'error',
          reason: (err as Error).message,
        });
        return {
          success: false,
          imagePath: null,
          caption: '',
          textFallback: `Failed to render report: ${(err as Error).message}`,
          error: (err as Error).message,
        };
      }
    },
  };
}
