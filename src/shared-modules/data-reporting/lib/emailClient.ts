/**
 * SMTP email client for sending reports via email.
 * Uses nodemailer with Office365 SMTP.
 * Password is NEVER logged or exposed.
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import pino from 'pino';

const logger = pino({ name: 'email-client' });

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  tls: boolean;
}

export interface EmailPayload {
  to: string;
  cc?: string[];
  subject: string;
  body: string;
  attachmentPath?: string;
  attachmentName?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  zipped?: boolean;
}

export class EmailClient {
  private transporter: Transporter;
  private sender: string;

  constructor(config: SmtpConfig) {
    this.sender = config.user;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: false, // STARTTLS on port 587
      auth: {
        user: config.user,
        pass: config.pass,
      },
      tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false,
      },
    });
    logger.info({ host: config.host, port: config.port, user: config.user }, 'Email client created');
  }

  async send(payload: EmailPayload): Promise<EmailResult> {
    const { to, cc, subject, body, attachmentPath, attachmentName } = payload;

    // Build mail options
    const mailOptions: nodemailer.SendMailOptions = {
      from: this.sender,
      to,
      cc: cc?.join(', '),
      subject,
      text: body,
      html: body.replace(/\n/g, '<br>'),
    };

    // Add attachment if provided
    if (attachmentPath) {
      try {
        await stat(attachmentPath);
      } catch {
        return { success: false, error: `Attachment file not found: ${attachmentPath}` };
      }

      const filename = attachmentName || basename(attachmentPath);
      mailOptions.attachments = [
        {
          filename,
          content: createReadStream(attachmentPath),
        },
      ];
    }

    // Attempt to send
    try {
      logger.info({ to, cc, subject, hasAttachment: !!attachmentPath }, 'Sending email');
      const info = await this.transporter.sendMail(mailOptions);
      logger.info({ messageId: info.messageId, to, subject }, 'Email sent successfully');
      return { success: true, messageId: info.messageId };
    } catch (err) {
      const errMsg = (err as Error).message ?? 'Unknown SMTP error';
      logger.error({ to, subject, error: errMsg }, 'Email send failed');

      // Check if it's a size-related error — attempt zip fallback
      if (this.isSizeError(errMsg) && attachmentPath) {
        return this.sendWithZip(payload);
      }

      return { success: false, error: errMsg };
    }
  }

  private isSizeError(errorMsg: string): boolean {
    const sizeKeywords = ['size', 'too large', 'exceeds', '552', '5.3.4', 'attachment'];
    return sizeKeywords.some(k => errorMsg.toLowerCase().includes(k));
  }

  private async sendWithZip(payload: EmailPayload): Promise<EmailResult> {
    if (!payload.attachmentPath) {
      return { success: false, error: 'No attachment to zip' };
    }

    logger.info({ attachmentPath: payload.attachmentPath }, 'Attempting zip fallback for large attachment');

    try {
      const { createGzip } = await import('node:zlib');
      const { createReadStream: readStream, createWriteStream } = await import('node:fs');
      const { pipeline } = await import('node:stream/promises');

      const zipPath = payload.attachmentPath + '.gz';
      await pipeline(
        readStream(payload.attachmentPath),
        createGzip(),
        createWriteStream(zipPath),
      );

      const zipName = (payload.attachmentName || basename(payload.attachmentPath)) + '.gz';

      const mailOptions: nodemailer.SendMailOptions = {
        from: this.sender,
        to: payload.to,
        cc: payload.cc?.join(', '),
        subject: payload.subject,
        text: payload.body,
        html: payload.body.replace(/\n/g, '<br>'),
        attachments: [
          {
            filename: zipName,
            content: readStream(zipPath),
          },
        ],
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info({ messageId: info.messageId, zipped: true }, 'Email sent with zip fallback');
      return { success: true, messageId: info.messageId, zipped: true };
    } catch (err) {
      const errMsg = (err as Error).message ?? 'Unknown zip/send error';
      logger.error({ error: errMsg }, 'Zip fallback also failed');
      return { success: false, error: `Zip fallback failed: ${errMsg}` };
    }
  }
}

/**
 * Build SMTP config from org environment variables.
 */
export function buildSmtpConfig(orgEnv: Record<string, string>): SmtpConfig {
  const host = orgEnv['SMTP_HOST'] ?? orgEnv['SMTP_SERVER'] ?? '';
  const port = parseInt(orgEnv['SMTP_PORT'] ?? '587', 10);
  const user = orgEnv['SMTP_USER'] ?? orgEnv['SMTP_SENDER_EMAIL'] ?? '';
  const pass = orgEnv['SMTP_PASS'] ?? orgEnv['SMTP_SENDER_PASSWORD'] ?? '';
  const tls = (orgEnv['SMTP_TLS'] ?? 'true') === 'true';

  if (!host || !user || !pass) {
    throw new Error('SMTP config incomplete. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env');
  }

  return { host, port, user, pass, tls };
}
