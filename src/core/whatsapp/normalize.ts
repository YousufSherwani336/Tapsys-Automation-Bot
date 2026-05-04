import type { proto } from '@whiskeysockets/baileys';

export interface NormalizedMessage {
  from: string;
  text: string;
  /** True when the bot's own JID is in the message's mentionedJid list or text contains @<botNumber>. */
  isMentioned: boolean;
  mediaType?: 'image' | 'audio' | 'video' | 'document';
  /** v1: populated only for future preprocessors; may be undefined */
  mediaBuffer?: Buffer;
  /** The raw Baileys message. Never logged above debug level (may contain PII). */
  raw: proto.IWebMessageInfo;
}

/**
 * Converts a raw Baileys proto message into a NormalizedMessage.
 * Returns null for messages we don't handle:
 *   - status broadcasts
 *   - our own outgoing messages
 *   - empty or unsupported message types
 *
 * @param botJid - The bot's own WhatsApp JID (sock.user.id). Used for mention detection.
 * @param botLid - The bot's LID (sock.user.lid). WhatsApp uses @lid format on newer clients.
 */
export function normalizeMessage(
  waMessage: proto.IWebMessageInfo,
  botJid?: string,
  botLid?: string,
): NormalizedMessage | null {
  const jid = waMessage.key?.remoteJid;
  if (!jid) return null;

  // Drop own messages
  if (waMessage.key?.fromMe) return null;

  // Drop WhatsApp status broadcast channel
  if (jid === 'status@broadcast') return null;

  const msg = waMessage.message;
  if (!msg) return null;

  let text = '';
  let mediaType: NormalizedMessage['mediaType'];

  if (msg.conversation) {
    text = msg.conversation;
  } else if (msg.extendedTextMessage?.text) {
    text = msg.extendedTextMessage.text;
  } else if (msg.imageMessage) {
    mediaType = 'image';
    text = msg.imageMessage.caption ?? '';
  } else if (msg.audioMessage) {
    mediaType = 'audio';
    text = '';
  } else if (msg.videoMessage) {
    mediaType = 'video';
    text = msg.videoMessage.caption ?? '';
  } else if (msg.documentMessage) {
    mediaType = 'document';
    text = msg.documentMessage.caption ?? '';
  } else {
    // Unsupported message type (reactions, polls, stickers, etc.) — skip
    return null;
  }

  // ── Mention detection ──────────────────────────────────────────────────
  let isMentioned = false;

  // mentionedJid can live in contextInfo of any message type
  const contextInfo =
    msg.extendedTextMessage?.contextInfo ??
    msg.imageMessage?.contextInfo ??
    msg.videoMessage?.contextInfo ??
    msg.documentMessage?.contextInfo;
  const mentionedJids: string[] =
    (contextInfo?.mentionedJid as string[] | undefined) ?? [];

  if (botJid) {
    // Normalize bot number: "923268002380:22@s.whatsapp.net" → "923268002380"
    const botNumber = botJid.split('@')[0].split(':')[0];

    // Check mentionedJid list (standard phone-number JID format)
    if (mentionedJids.some((m) => m.startsWith(botNumber))) {
      isMentioned = true;
    }

    // Also check text for @<number> pattern (some clients include it in text)
    if (!isMentioned && text.includes(`@${botNumber}`)) {
      isMentioned = true;
    }

    // Also match local number format: "923268002380" → "@03268002380" (Pakistani 92 prefix → 0x)
    if (!isMentioned && botNumber.length > 2) {
      const localNumber = '0' + botNumber.slice(2);
      if (text.includes(`@${localNumber}`)) {
        isMentioned = true;
      }
    }
  }

  // WhatsApp newer clients use @lid (Linked ID) format instead of phone numbers.
  // botLid may be "60349306933430:22@lid"; mentionedJid is "60349306933430@lid" (no device suffix).
  if (!isMentioned && botLid) {
    const botLidBase = botLid.split(':')[0].split('@')[0]; // "60349306933430:22@lid" → "60349306933430"
    if (mentionedJids.some((m) => m.startsWith(botLidBase))) {
      isMentioned = true;
    }
    // Also check text for @<lidBase> pattern (some clients embed LID in caption text)
    if (!isMentioned && text.includes(`@${botLidBase}`)) {
      isMentioned = true;
    }
  }

  // DMs (not groups) are always "mentioned" — the bot is the direct recipient.
  if (!jid.endsWith('@g.us')) {
    isMentioned = true;
  }

  return {
    from: jid,
    text,
    isMentioned,
    ...(mediaType !== undefined ? { mediaType } : {}),
    raw: waMessage,
  };
}
