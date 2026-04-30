import { describe, it, expect } from 'vitest';
import type { proto } from '@whiskeysockets/baileys';
import { normalizeMessage } from './normalize.js';

/**
 * Builds a minimal proto.IWebMessageInfo test fixture.
 * Cast to proto.IWebMessageInfo is safe: all fields on protobuf interfaces are
 * optional by definition; we only populate what normalizeMessage actually reads.
 */
function makeMsg(partial: {
  remoteJid?: string;
  fromMe?: boolean;
  message?: proto.IMessage | null;
}): proto.IWebMessageInfo {
  return {
    key: {
      remoteJid: partial.remoteJid ?? '15551234567@s.whatsapp.net',
      fromMe: partial.fromMe ?? false,
    },
    message: partial.message,
  } as unknown as proto.IWebMessageInfo;
}

describe('normalizeMessage', () => {
  it('returns null when remoteJid is missing', () => {
    const msg = { key: {}, message: { conversation: 'hi' } } as unknown as proto.IWebMessageInfo;
    expect(normalizeMessage(msg)).toBeNull();
  });

  it('returns null for own messages (fromMe = true)', () => {
    expect(
      normalizeMessage(makeMsg({ fromMe: true, message: { conversation: 'hi' } })),
    ).toBeNull();
  });

  it('returns null for status broadcasts', () => {
    expect(
      normalizeMessage(
        makeMsg({ remoteJid: 'status@broadcast', message: { conversation: 'hi' } }),
      ),
    ).toBeNull();
  });

  it('returns null when message body is null', () => {
    expect(normalizeMessage(makeMsg({ message: null }))).toBeNull();
  });

  it('returns null when message body is undefined', () => {
    expect(normalizeMessage(makeMsg({ message: undefined }))).toBeNull();
  });

  it('normalizes a plain text conversation message', () => {
    const result = normalizeMessage(
      makeMsg({ message: { conversation: 'Hello!' } }),
    );
    expect(result).not.toBeNull();
    expect(result!.text).toBe('Hello!');
    expect(result!.from).toBe('15551234567@s.whatsapp.net');
    expect(result!.mediaType).toBeUndefined();
  });

  it('normalizes extendedTextMessage', () => {
    const result = normalizeMessage(
      makeMsg({ message: { extendedTextMessage: { text: 'Extended hello' } } }),
    );
    expect(result!.text).toBe('Extended hello');
    expect(result!.mediaType).toBeUndefined();
  });

  it('normalizes image message with caption', () => {
    const result = normalizeMessage(
      makeMsg({ message: { imageMessage: { caption: 'Look at this!' } } }),
    );
    expect(result!.mediaType).toBe('image');
    expect(result!.text).toBe('Look at this!');
  });

  it('normalizes image message without caption', () => {
    const result = normalizeMessage(
      makeMsg({ message: { imageMessage: {} } }),
    );
    expect(result!.mediaType).toBe('image');
    expect(result!.text).toBe('');
  });

  it('normalizes audio message', () => {
    const result = normalizeMessage(
      makeMsg({ message: { audioMessage: {} } }),
    );
    expect(result!.mediaType).toBe('audio');
    expect(result!.text).toBe('');
  });

  it('normalizes video message with caption', () => {
    const result = normalizeMessage(
      makeMsg({ message: { videoMessage: { caption: 'Watch this' } } }),
    );
    expect(result!.mediaType).toBe('video');
    expect(result!.text).toBe('Watch this');
  });

  it('normalizes document message with caption', () => {
    const result = normalizeMessage(
      makeMsg({ message: { documentMessage: { caption: 'See attached' } } }),
    );
    expect(result!.mediaType).toBe('document');
    expect(result!.text).toBe('See attached');
  });

  it('includes the raw message on the result', () => {
    const raw = makeMsg({ message: { conversation: 'raw test' } });
    const result = normalizeMessage(raw);
    expect(result!.raw).toBe(raw);
  });

  it('returns null for unsupported message types (e.g. reaction)', () => {
    const result = normalizeMessage(
      makeMsg({
        // Cast justified: reactionMessage is a valid proto field but not in the
        // trimmed IMessage typings used here; we assert unknown first.
        message: { reactionMessage: { text: '👍' } } as unknown as proto.IMessage,
      }),
    );
    expect(result).toBeNull();
  });
});
