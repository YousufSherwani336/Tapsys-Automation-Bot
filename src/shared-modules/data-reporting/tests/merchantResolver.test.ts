import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MerchantResolver } from '../lib/merchantResolver.js';
import type { SqlServerClient } from '../lib/sqlServerClient.js';

function makeMockDb(rows: Record<string, unknown>[]): SqlServerClient {
  return {
    query: vi.fn().mockResolvedValue({
      rows,
      rowCount: rows.length,
      columns: rows.length > 0 ? Object.keys(rows[0]) : [],
      truncated: false,
      durationMs: 5,
    }),
    testConnection: vi.fn().mockResolvedValue({ ok: true }),
    close: vi.fn(),
  } as unknown as SqlServerClient;
}

describe('MerchantResolver', () => {
  describe('resolveByName — single match', () => {
    it('returns exact=true when only one merchant matches', async () => {
      const db = makeMockDb([{ mid: '100', name: 'ABC Store', city: 'Lahore', region: 'Central' }]);
      const resolver = new MerchantResolver(db);
      const result = await resolver.resolve('ABC Store');

      expect(result.found).toBe(true);
      expect(result.exact).toBe(true);
      expect(result.ambiguous).toBe(false);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].mid).toBe('100');
    });
  });

  describe('resolveByName — multiple matches (ambiguous)', () => {
    it('returns ambiguous=true and clarificationText when >1 merchant found', async () => {
      const db = makeMockDb([
        { mid: '100', name: 'ABC Store Lahore', city: 'Lahore', region: 'Central' },
        { mid: '101', name: 'ABC Store Karachi', city: 'Karachi', region: 'South' },
      ]);
      const resolver = new MerchantResolver(db);
      const result = await resolver.resolve('ABC Store');

      expect(result.found).toBe(true);
      expect(result.ambiguous).toBe(true);
      expect(result.matches).toHaveLength(2);
      expect(result.clarificationText).toContain('Multiple merchants found');
      expect(result.clarificationText).toContain('MID: 100');
      expect(result.clarificationText).toContain('MID: 101');
    });
  });

  describe('resolveByName — no match', () => {
    it('returns found=false when no merchants match', async () => {
      const db = makeMockDb([]);
      const resolver = new MerchantResolver(db);
      const result = await resolver.resolve('XYZ NonExistent');

      expect(result.found).toBe(false);
      expect(result.exact).toBe(false);
      expect(result.ambiguous).toBe(false);
      expect(result.matches).toHaveLength(0);
    });
  });

  describe('resolveById (numeric MID)', () => {
    it('performs an exact MID lookup when input is numeric', async () => {
      const db = makeMockDb([{ mid: '12345', name: 'XYZ Traders', city: 'Karachi', region: 'South' }]);
      const resolver = new MerchantResolver(db);
      const result = await resolver.resolve('12345');

      expect(result.found).toBe(true);
      expect(result.exact).toBe(true);
      expect(result.matches[0].mid).toBe('12345');
      // Confirm the DB query contained the MID as a number
      expect((db.query as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('12345');
    });

    it('returns found=false for unknown MID', async () => {
      const db = makeMockDb([]);
      const resolver = new MerchantResolver(db);
      const result = await resolver.resolve('99999');

      expect(result.found).toBe(false);
    });
  });
});
