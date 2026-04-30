import { describe, it, expect, afterEach } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadOrgConfig } from './loadOrgConfig.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES_ORGS = resolve(__dirname, '../../../tests/fixtures/orgs');

describe('loadOrgConfig', () => {
  const savedOrg = process.env['ORG'];

  afterEach(() => {
    if (savedOrg === undefined) {
      delete process.env['ORG'];
    } else {
      process.env['ORG'] = savedOrg;
    }
  });

  it('throws when ORG env var is missing', async () => {
    delete process.env['ORG'];
    await expect(loadOrgConfig(FIXTURES_ORGS)).rejects.toThrow(
      'Missing required environment variable: ORG',
    );
  });

  it('throws with the resolved path when org directory does not exist', async () => {
    process.env['ORG'] = 'nonexistent-org';
    await expect(loadOrgConfig(FIXTURES_ORGS)).rejects.toThrow('nonexistent-org');
  });

  it('throws a ZodError including the field path for malformed config.yaml', async () => {
    process.env['ORG'] = 'malformed-config-org';
    await expect(loadOrgConfig(FIXTURES_ORGS)).rejects.toThrow(/orgSlug/);
  });

  it('returns a valid OrgContext for a well-formed org', async () => {
    process.env['ORG'] = 'test-org';
    const ctx = await loadOrgConfig(FIXTURES_ORGS);

    expect(ctx.slug).toBe('test-org');
    expect(ctx.config.orgSlug).toBe('test-org');
    expect(ctx.config.whatsapp?.groupId).toBe('1234567890');

    expect(typeof ctx.systemPrompt).toBe('string');
    expect(ctx.systemPrompt.length).toBeGreaterThan(0);

    expect(ctx.rootDir).toContain('test-org');
    expect(ctx.sessionDir).toContain('wa-session');
    expect(ctx.runtimeDir).toContain('runtime');

    // .env vars are scoped; must NOT pollute global process.env
    expect(ctx.env['TEST_VAR']).toBe('hello');
    expect(process.env['TEST_VAR']).toBeUndefined();
  });
});
