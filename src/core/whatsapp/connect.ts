/**
 * Baileys is only touched inside src/core/whatsapp/ — convention §11.
 * No other file may import @whiskeysockets/baileys.
 */
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestWaWebVersion,
  Browsers,
  type WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { OrgContext } from '../../types/index.js';
import type { NormalizedMessage } from './normalize.js';
import { normalizeMessage } from './normalize.js';
import { sendText, sendImage } from './send.js';

export interface WhatsAppConnection {
  onMessage(handler: (msg: NormalizedMessage) => void): void;
  sendText(jid: string, text: string): Promise<void>;
  sendImage(jid: string, imagePath: string, caption?: string): Promise<void>;
  sendPresenceUpdate(type: 'composing' | 'paused' | 'available', jid: string): Promise<void>;
  close(): Promise<void>;
}

/**
 * Opens a persistent WhatsApp connection for the given org.
 *
 * - Session files are stored at orgContext.sessionDir (orgs/<slug>/wa-session/).
 * - On first run, prints a QR code to stdout; subsequent runs reuse saved creds.
 * - Reconnects automatically on non-logout disconnects.
 * - If orgContext.config.whatsapp.groupId is set, only messages from that JID
 *   are forwarded to the onMessage handler.
 * - If orgContext.config.whatsapp.requireMention is true, only messages where
 *   the bot is @mentioned are forwarded (applies to group messages only).
 */
export async function connectWhatsApp(
  orgContext: OrgContext,
): Promise<WhatsAppConnection> {
  // Write all logs (debug+) to a rotating log file as well as stdout.
  const logDir = join(process.cwd(), 'logs');
  await mkdir(logDir, { recursive: true });
  const logFile = join(logDir, `${orgContext.slug}-${new Date().toISOString().slice(0, 10)}.log`);
  const fileStream = createWriteStream(logFile, { flags: 'a' });
  const logger = pino(
    { level: 'debug' },
    pino.multistream([
      { stream: process.stdout, level: 'debug' },
      { stream: fileStream, level: 'debug' },
    ]),
  ).child({ org: orgContext.slug, subsystem: 'whatsapp' });

  const { state, saveCreds } = await useMultiFileAuthState(
    orgContext.sessionDir,
  );

  // fetchLatestWaWebVersion fetches from web.whatsapp.com/sw.js (not GitHub).
  // This works on restricted networks where raw.githubusercontent.com is blocked.
  const { version, isLatest } = await fetchLatestWaWebVersion();
  logger.info({ version, isLatest }, 'Using WA Web version');

  // Mutable reference — replaced by createSocket() on reconnect.
  let sock: WASocket;
  let botJid: string | undefined;
  let botLid: string | undefined;
  let messageHandler: ((msg: NormalizedMessage) => void) | null = null;
  let closed = false;
  let reconnectAttempt = 0;

  function scheduleReconnect(statusCode: number | undefined): void {
    if (closed) return;
    // 405 = rate-limited by WhatsApp server. Back off aggressively.
    const base = statusCode === 405 ? 30_000 : 3_000;
    const delay = Math.min(base * Math.pow(2, reconnectAttempt), 300_000);
    reconnectAttempt++;
    logger.warn({ statusCode, delayMs: delay, attempt: reconnectAttempt }, 'Connection closed — reconnecting with backoff');
    setTimeout(() => { if (!closed) createSocket(); }, delay);
  }

  function createSocket(): void {
    const silentLogger = pino({ level: 'silent' });

    sock = makeWASocket({
      auth: state,
      version,
      browser: Browsers.macOS('Desktop'),
      printQRInTerminal: false,
      logger: silentLogger as unknown as Parameters<typeof makeWASocket>[0]['logger'],
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        qrcode.generate(qr, { small: true });
        logger.info('QR code generated — scan with WhatsApp to connect');
      }

      if (connection === 'open') {
        // Capture bot JID and LID after successful connection.
        // Newer WhatsApp clients use LID (@lid) format for @mentions.
        botJid = sock.user?.id;
        botLid = (sock.user as unknown as Record<string, unknown>)?.['lid'] as string | undefined;
        reconnectAttempt = 0;  // reset backoff on successful connect
        logger.info({ botJid, botLid }, 'WhatsApp connection established');
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect =
          !closed && statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
          scheduleReconnect(statusCode);
        } else if (!closed) {
          logger.error(
            { statusCode },
            'Logged out from WhatsApp — not reconnecting',
          );
        }
      }
    });

    sock.ev.on('messages.upsert', ({ messages, type }) => {
      logger.info({ count: messages.length, type }, 'RAW messages.upsert received');

      if (!messageHandler) {
        logger.info('No messageHandler registered — skipping');
        return;
      }

      const groupId = orgContext.config.whatsapp?.groupId;
      const requireMention = orgContext.config.whatsapp?.requireMention ?? false;

      for (const waMsg of messages) {
        const from = waMsg.key?.remoteJid ?? 'unknown';
        logger.info({ from, fromMe: waMsg.key?.fromMe }, 'Processing raw message');

        const normalized = normalizeMessage(waMsg, botJid, botLid);
        if (!normalized) {
          logger.info({ from }, 'Message skipped by normalizer (unsupported type or own message)');
          continue;
        }

        // If a groupId is configured, silently drop messages from other JIDs.
        if (groupId && normalized.from !== groupId) {
          logger.info(
            { from: normalized.from, expected: groupId },
            'DROPPED: group ID mismatch',
          );
          continue;
        }

        // If requireMention is set, only process messages where the bot is mentioned.
        if (requireMention && !normalized.isMentioned) {
          logger.info({ from: normalized.from, text: normalized.text?.slice(0, 80) }, 'DROPPED: bot not mentioned');
          continue;
        }

        logger.info({ from: normalized.from, isMentioned: normalized.isMentioned, text: normalized.text?.slice(0, 80) }, 'MESSAGE ACCEPTED → sending to agent');
        messageHandler(normalized);
      }
    });
  }

  createSocket();

  return {
    onMessage(handler) {
      messageHandler = handler;
    },

    async sendText(jid, text) {
      await sendText(sock, jid, text);
    },

    async sendImage(jid, imagePath, caption) {
      await sendImage(sock, jid, imagePath, caption);
    },

    async sendPresenceUpdate(type, jid) {
      try {
        await sock.presenceSubscribe(jid);
        await sock.sendPresenceUpdate(type, jid);
      } catch (err) {
        logger.debug({ err, type, jid }, 'Presence update failed (non-fatal)');
      }
    },

    async close() {
      closed = true;
      sock.ev.removeAllListeners('creds.update');
      sock.ev.removeAllListeners('connection.update');
      sock.ev.removeAllListeners('messages.upsert');
      sock.end(undefined);
      logger.info('WhatsApp connection closed');
    },
  };
}
