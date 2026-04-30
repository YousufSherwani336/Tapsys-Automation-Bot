/**
 * Tool: data_reporting.get_memory
 * Retrieves stored preferences and last-report info for a WhatsApp user.
 */

import { z } from 'zod';
import type { ToolDefinition } from '../../../types/index.js';
import type { MemoryStore, UserMemory } from '../lib/memoryStore.js';

export const GetMemoryInput = z.object({
  jid: z.string().describe('WhatsApp JID of the user whose memory to retrieve.'),
});

export type GetMemoryInputType = z.infer<typeof GetMemoryInput>;

export interface GetMemoryResult {
  found: boolean;
  memory: Partial<UserMemory> | null;
}

export function buildGetMemoryTool(
  memoryStore: MemoryStore,
): ToolDefinition<GetMemoryInputType, GetMemoryResult> {
  return {
    name: 'data_reporting.get_memory',
    description:
      'Retrieves stored user preferences (preferred merchant, region, date range, report type) ' +
      'and the path to the last generated report for a WhatsApp user.',
    inputSchema: GetMemoryInput,
    handler: async (input) => {
      const memory = memoryStore.getMemory(input.jid);
      return { found: memory !== null, memory };
    },
  };
}
