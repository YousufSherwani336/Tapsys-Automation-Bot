import { readFile } from 'node:fs/promises';
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
