import { z } from 'zod';

export const OrgConfigSchema = z.object({
  orgSlug: z.string(),
  whatsapp: z
    .object({
      groupId: z.string().optional(),
      /** Only process messages where the bot is @mentioned (group chats). */
      requireMention: z.boolean().optional(),
    })
    .optional(),
  memory: z.record(z.unknown()).optional(),
  preprocessing: z.record(z.unknown()).optional(),
});

export type OrgConfig = z.infer<typeof OrgConfigSchema>;
