# Plan 06: WhatsApp (Baileys) integration

**TL;DR** Per-org WhatsApp connection with isolated session storage; receive + send messages ([README §11](../README-v2.md)).

**Depends on**: [Plan 01](01-scaffolding-and-config.md).

## Steps

1. Add dependency: `@whiskeysockets/baileys` (current maintained Baileys fork) and `qrcode-terminal` for QR rendering. Also `@hapi/boom` (used by Baileys reconnect logic).
2. `src/core/whatsapp/connect.ts`:
   - `connectWhatsApp(orgContext): Promise<WhatsAppConnection>`
   - Uses `useMultiFileAuthState(orgContext.sessionDir)` where `sessionDir = orgs/<slug>/wa-session/`.
   - Creates socket via `makeWASocket({ auth, printQRInTerminal: false })`; render QR with `qrcode-terminal` on `connection.update` event when `qr` present.
   - `creds.update` saved.
   - `connection.update`: on `close`, check `(lastDisconnect?.error as Boom)?.output?.statusCode`; reconnect unless logged out (`DisconnectReason.loggedOut`).
3. `src/core/whatsapp/normalize.ts`:
   - `normalizeMessage(waMessage): NormalizedMessage | null`
   - Returns `{ from: string (jid), text: string, mediaType?: 'image'|'audio'|'video'|'document', mediaBuffer?: Buffer, raw }`.
   - Returns `null` for messages we don't handle (status broadcasts, our own messages, empty).
4. `src/core/whatsapp/send.ts`:
   - `sendText(sock, jid, text): Promise<void>`.
5. `src/core/whatsapp/index.ts`:
   - `WhatsAppConnection = { onMessage(handler: (msg: NormalizedMessage) => void): void; sendText(jid: string, text: string): Promise<void>; close(): Promise<void>; }`.
   - Internal handler chain wires `messages.upsert` → `normalizeMessage` → user-supplied handler.
   - If `orgContext.config.whatsapp?.groupId` is set, drop messages whose `from` does not match.
6. Logging: pino child logger tagged with `org=<slug>` for all WA events.

## Files created

- `src/core/whatsapp/{connect,normalize,send,index}.ts`

## Verification

1. Manual: `ORG=example` test harness script connects, prints QR, scan with phone, session files appear under `orgs/example/wa-session/`.
2. Send a text message from another phone → harness's `onMessage` fires with normalized payload; log contains the org slug.
3. Restart the harness → reconnects without re-scanning QR.
4. Send a media message → `mediaType` populated; v1 may ignore the buffer but normalization should not throw.
5. With `groupId` set in `config.yaml`, messages from other JIDs are dropped (verified via log).

## Out of scope

Media preprocessing (deferred), queue (plan 07), Pi (plan 10).
