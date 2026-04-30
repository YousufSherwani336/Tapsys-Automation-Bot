import { describe, it, expect } from 'vitest';
import { validateSql } from '../lib/sqlValidator.js';

describe('validateSql', () => {
  // ── Allowed ─────────────────────────────────────────────────────────────
  it('allows a plain SELECT', () => {
    const result = validateSql('SELECT id, name FROM merchant WHERE status = \'active\'');
    expect(result.valid).toBe(true);
  });

  it('allows a WITH CTE query', () => {
    const sql = `
      WITH summary AS (
        SELECT merchant_id, COUNT(*) AS cnt FROM pos_settlement GROUP BY merchant_id
      )
      SELECT * FROM summary
    `;
    const result = validateSql(sql);
    expect(result.valid).toBe(true);
  });

  it('allows DECLARE + SELECT (T-SQL date variables)', () => {
    const sql = `
      DECLARE @start_date DATE = CAST(DATEADD(DAY,-1,GETDATE()) AS DATE)
      DECLARE @end_date DATE = CAST(DATEADD(DAY,-1,GETDATE()) AS DATE)
      SELECT * FROM pos_settlement WHERE settlement_date BETWEEN @start_date AND @end_date
    `;
    const result = validateSql(sql);
    expect(result.valid).toBe(true);
  });

  // ── Blocked ──────────────────────────────────────────────────────────────
  it('rejects INSERT', () => {
    const result = validateSql('INSERT INTO merchant (name) VALUES (\'hack\')');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('INSERT');
  });

  it('rejects UPDATE', () => {
    const result = validateSql('UPDATE merchant SET status = \'inactive\'');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('UPDATE');
  });

  it('rejects DELETE', () => {
    const result = validateSql('DELETE FROM merchant WHERE id = 1');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('DELETE');
  });

  it('rejects DROP', () => {
    const result = validateSql('DROP TABLE merchant');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('DROP');
  });

  it('rejects TRUNCATE', () => {
    const result = validateSql('TRUNCATE TABLE pos_settlement');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('TRUNCATE');
  });

  it('rejects xp_cmdshell', () => {
    const result = validateSql("SELECT * FROM merchant; EXEC xp_cmdshell('dir')");
    expect(result.valid).toBe(false);
  });

  it('rejects EXEC dynamic SQL', () => {
    const result = validateSql("EXEC ('SELECT * FROM merchant')");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/EXEC/i);
  });

  it('rejects hidden INSERT inside a comment strip', () => {
    const result = validateSql("SELECT 1 /* INSERT INTO */ INSERT INTO t VALUES (1)");
    expect(result.valid).toBe(false);
  });

  it('rejects DECLARE without SELECT', () => {
    const result = validateSql('DECLARE @x INT = 1');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('DECLARE block has no SELECT');
  });

  it('rejects empty SQL', () => {
    const result = validateSql('');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Empty');
  });

  it('rejects SQL starting with a non-allowed keyword', () => {
    const result = validateSql('MERGE INTO merchant USING source ON ...');
    expect(result.valid).toBe(false);
  });
});
