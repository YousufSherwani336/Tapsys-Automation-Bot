import { describe, it, expect } from 'vitest';
import { parseDateRange } from '../lib/dateParser.js';

// Fixed reference date: 2025-01-15 (Wednesday)
const REF = new Date(2025, 0, 15); // Jan 15 2025

describe('parseDateRange', () => {
  it('parses "yesterday"', () => {
    const r = parseDateRange('yesterday', REF);
    expect(r.type).toBe('yesterday');
    expect(r.startDate).toBe('2025-01-14');
    expect(r.endDate).toBe('2025-01-14');
    expect(r.label).toContain('2025-01-14');
  });

  it('parses "kal" (Roman Urdu for yesterday)', () => {
    const r = parseDateRange('kal ka data do', REF);
    expect(r.type).toBe('yesterday');
    expect(r.startDate).toBe('2025-01-14');
  });

  it('parses "today"', () => {
    const r = parseDateRange('today', REF);
    expect(r.type).toBe('today');
    expect(r.startDate).toBe('2025-01-15');
    expect(r.endDate).toBe('2025-01-15');
  });

  it('parses "aaj" (Roman Urdu for today)', () => {
    const r = parseDateRange('aaj ki sale', REF);
    expect(r.type).toBe('today');
    expect(r.startDate).toBe('2025-01-15');
  });

  it('parses "MTD"', () => {
    const r = parseDateRange('MTD report chahiye', REF);
    expect(r.type).toBe('mtd');
    expect(r.startDate).toBe('2025-01-01');
    expect(r.endDate).toBe('2025-01-14');
  });

  it('parses "is maheenay" (Roman Urdu for MTD)', () => {
    const r = parseDateRange('is maheenay ka data', REF);
    expect(r.type).toBe('mtd');
    expect(r.startDate).toBe('2025-01-01');
  });

  it('parses "last 30 days"', () => {
    const r = parseDateRange('last 30 days', REF);
    expect(r.type).toBe('last_30_days');
    expect(r.startDate).toBe('2024-12-16');
    expect(r.endDate).toBe('2025-01-14');
  });

  it('parses "pichhlay 30 din" (Roman Urdu for last 30 days)', () => {
    const r = parseDateRange('pichhlay 30 din ka summary', REF);
    expect(r.type).toBe('last_30_days');
  });

  it('parses "last week"', () => {
    const r = parseDateRange('last week ka data', REF);
    expect(r.type).toBe('last_7_days');
    expect(r.startDate).toBe('2025-01-08');
    expect(r.endDate).toBe('2025-01-14');
  });

  it('defaults to yesterday when no date keyword given', () => {
    const r = parseDateRange('MPOS regional dashboard bhejo', REF);
    expect(r.type).toBe('yesterday');
    expect(r.startDate).toBe('2025-01-14');
  });
});
