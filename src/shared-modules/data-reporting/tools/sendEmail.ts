/**
 * Tool: data_reporting.send_email
 * Sends an email via SMTP with optional attachment (report image or Excel).
 * Supports zip fallback for oversized attachments.
 */

import { z } from 'zod';
import { resolve } from 'node:path';
import type { ToolDefinition } from '../../../types/index.js';
import type { AuditLogger } from '../lib/auditLogger.js';
import type { EmailClient } from '../lib/emailClient.js';

const MANDATORY_CC = 'Operations@tapsys.net';

const SIGNATURE = '\n\nRegards,\nPaysys Bot Agent';

export const SendEmailInput = z.object({
  to: z
    .string()
    .email()
    .describe('Recipient email address.'),
  cc: z
    .array(z.string().email())
    .optional()
    .describe('Additional CC email addresses. Operations@tapsys.net is always included automatically.'),
  subject: z
    .string()
    .describe('Email subject line. Should be short and professional (3-4 words).'),
  body: z
    .string()
    .describe('Email body text. Signature is appended automatically.'),
  attachmentPath: z
    .string()
    .optional()
    .describe('Path to attachment file (report image or Excel). Relative to project root.'),
  attachmentName: z
    .string()
    .optional()
    .describe('Display filename for the attachment in the email.'),
});

export type SendEmailInputType = z.infer<typeof SendEmailInput>;

export interface SendEmailResult {
  success: boolean;
  message: string;
  messageId?: string;
  zipped?: boolean;
  error?: string;
}

export function buildSendEmailTool(
  emailClient: EmailClient,
  audit: AuditLogger,
  from: string,
): ToolDefinition<SendEmailInputType, SendEmailResult> {
  return {
    name: 'data_reporting.send_email',
    description:
      'Sends an email via SMTP. Can include an attachment (report image or Excel file). ' +
      'Operations@tapsys.net is always CC\'d automatically. ' +
      'If attachment is too large, automatically retries with compressed zip. ' +
      'Use this when user asks to email a report or send data via email.',
    inputSchema: SendEmailInput,
    handler: async (input) => {
      const { to, cc, subject, body, attachmentPath, attachmentName } = input;

      // Build CC list — always include mandatory CC, deduplicate
      const ccSet = new Set<string>();
      ccSet.add(MANDATORY_CC);
      if (cc) {
        for (const addr of cc) {
          if (addr.toLowerCase() !== MANDATORY_CC.toLowerCase()) {
            ccSet.add(addr);
          }
        }
      }
      // Remove recipient from CC if accidentally included
      ccSet.delete(to);

      const ccList = Array.from(ccSet);

      // Append signature to body
      const fullBody = body.trimEnd() + SIGNATURE;

      // Resolve attachment path if provided
      let resolvedAttachment: string | undefined;
      if (attachmentPath) {
        resolvedAttachment = resolve(process.cwd(), attachmentPath);
      }

      // Send
      const result = await emailClient.send({
        to,
        cc: ccList,
        subject,
        body: fullBody,
        attachmentPath: resolvedAttachment,
        attachmentName,
      });

      // Audit log (never log email body content for privacy)
      audit.log({
        action: 'send_email',
        from,
        queryDescription: `Email to ${to}, subject: ${subject}`,
        filters: {
          to,
          cc: ccList.join(', '),
          hasAttachment: !!attachmentPath,
          zipped: result.zipped ?? false,
        },
        status: result.success ? 'ok' : 'error',
        reason: result.error,
      });

      if (result.success) {
        const msg = result.zipped
          ? 'Email send ho gayi hai. Attachment size ki wajah se zip format mein bheji gayi.'
          : 'Email send ho gayi hai.';
        return {
          success: true,
          message: msg,
          messageId: result.messageId,
          zipped: result.zipped,
        };
      } else {
        return {
          success: false,
          message: 'Email send karte huay issue aaya. Admin logs check kar raha hai.',
          error: result.error,
        };
      }
    },
  };
}
