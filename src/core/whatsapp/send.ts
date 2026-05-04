import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { WASocket } from '@whiskeysockets/baileys';

/** Sends a plain text message to the given WhatsApp JID. */
export async function sendText(
  sock: WASocket,
  jid: string,
  text: string,
): Promise<void> {
  await sock.sendMessage(jid, { text });
}

/**
 * Sends a PNG image file to the given WhatsApp JID.
 * @param imagePath - Absolute or relative path to the PNG file on disk.
 * @param caption   - Optional caption shown under the image.
 */
export async function sendImage(
  sock: WASocket,
  jid: string,
  imagePath: string,
  caption?: string,
): Promise<void> {
  const imageBuffer = await readFile(imagePath);
  await sock.sendMessage(jid, {
    image: imageBuffer,
    mimetype: 'image/png',
    caption: caption ?? '',
  });
}

/**
 * Sends a document file to the given WhatsApp JID.
 * @param filePath - Absolute or relative path to the file on disk.
 * @param fileName - Display name for the file in WhatsApp (e.g. "report.xlsx").
 * @param mimetype - MIME type of the document.
 * @param caption  - Optional caption shown with the document.
 */
export async function sendDocument(
  sock: WASocket,
  jid: string,
  filePath: string,
  fileName?: string,
  mimetype?: string,
  caption?: string,
): Promise<void> {
  const docBuffer = await readFile(filePath);
  await sock.sendMessage(jid, {
    document: docBuffer,
    mimetype: mimetype ?? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileName: fileName ?? basename(filePath),
    caption: caption ?? '',
  });
}
