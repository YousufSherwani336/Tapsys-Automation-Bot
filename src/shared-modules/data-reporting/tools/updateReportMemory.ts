/**
 * Tool: data_reporting.update_memory
 * Saves or clears user preferences and last-report metadata.
 * Only stores non-sensitive preference data — no raw DB results or secrets.
 */

import { z } from 'zod';
import type { ToolDefinition } from '../../../types/index.js';
import type { MemoryStore } from '../lib/memoryStore.js';

export const UpdateMemoryInput = z.object({
  jid: z.string().describe('WhatsApp JID of the user to update.'),
  action: z
    .enum(['update', 'clear'])
    .describe('"update" saves preferences; "clear" wipes all memory for this user.'),
  preferredMerchant: z.string().optional().describe('Merchant name to remember.'),
  preferredMid: z.string().optional().describe('Merchant ID to remember.'),
  preferredRegion: z.string().optional().describe('Region preference.'),
  preferredDateRange: z.string().optional().describe('Date range preference e.g. "yesterday".'),
  preferredReportType: z.string().optional().describe('Report type preference.'),
  lastReportPath: z.string().optional().describe('Path to the last generated PNG image.'),
  lastReportCaption: z.string().optional().describe('Caption of the last generated report.'),
});

export type UpdateMemoryInputType = z.infer<typeof UpdateMemoryInput>;

export interface UpdateMemoryResult {
  success: boolean;
  action: 'update' | 'clear';
  message: string;
}

export function buildUpdateMemoryTool(
  memoryStore: MemoryStore,
): ToolDefinition<UpdateMemoryInputType, UpdateMemoryResult> {
  return {
    name: 'data_reporting.update_memory',
    description:
      'Saves or clears user report preferences in persistent memory. ' +
      'Use action="clear" when the user asks to reset their memory.',
    inputSchema: UpdateMemoryInput,
    handler: async (input) => {
      if (input.action === 'clear') {
        memoryStore.clearMemory(input.jid);
        return { success: true, action: 'clear', message: 'Memory cleared successfully.' };
      }

      memoryStore.updateMemory(input.jid, {
        preferredMerchant: input.preferredMerchant,
        preferredMid: input.preferredMid,
        preferredRegion: input.preferredRegion,
        preferredDateRange: input.preferredDateRange,
        preferredReportType: input.preferredReportType,
        lastReportPath: input.lastReportPath,
        lastReportCaption: input.lastReportCaption,
      });

      return { success: true, action: 'update', message: 'Preferences saved.' };
    },
  };
}
