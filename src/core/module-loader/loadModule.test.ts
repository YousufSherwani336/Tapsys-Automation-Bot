import { describe, it, expect } from 'vitest';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { discoverModules } from './discover.js';
import { loadModule } from './loadModule.js';
import { loadOrgModules } from './index.js';
import type { OrgContext } from '../../types/index.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../../../tests/fixtures/orgs');

function makeOrgContext(slug: string): OrgContext {
  return {
    slug,
    rootDir: join(FIXTURES_DIR, slug),
    sessionDir: '',
    runtimeDir: '',
    config: { orgSlug: slug },
    env: {},
    systemPrompt: '',
  };
}

// ---------------------------------------------------------------------------
// discoverModules
// ---------------------------------------------------------------------------

describe('discoverModules', () => {
  it('returns [] when the org has no modules/ directory', async () => {
    const names = await discoverModules(join(FIXTURES_DIR, 'test-org'));
    expect(names).toEqual([]);
  });

  it('returns the sub-folder names for an org with modules', async () => {
    const names = await discoverModules(join(FIXTURES_DIR, 'one-jira-module-org'));
    expect(names).toEqual(['jira']);
  });
});

// ---------------------------------------------------------------------------
// loadModule
// ---------------------------------------------------------------------------

describe('loadModule', () => {
  it('loads all four parts for a well-formed module', async () => {
    const orgDir = join(FIXTURES_DIR, 'one-jira-module-org');
    const mod = await loadModule(orgDir, 'jira');

    expect(mod.name).toBe('jira');
    expect(mod.manifest.enabled).toBe(true);
    expect(mod.manifest.tools).toEqual([
      'jira.create_issue',
      'jira.search_issues',
      'jira.get_issue',
      'jira.add_comment',
    ]);
    expect(typeof mod.prompt).toBe('string');
    expect(mod.prompt.length).toBeGreaterThan(0);
    expect(mod.defaults).toMatchObject({ defaultProject: 'TEST' });
    expect(mod.vocabulary).toMatchObject({ aliases: {} });
  });

  it('throws with the absolute manifest path when manifest.yaml is missing', async () => {
    const orgDir = join(FIXTURES_DIR, 'missing-manifest-org');
    await expect(loadModule(orgDir, 'jira')).rejects.toThrow('manifest.yaml');
  });

  it('throws with the file path when manifest.yaml contains malformed YAML', async () => {
    const orgDir = join(FIXTURES_DIR, 'malformed-yaml-org');
    await expect(loadModule(orgDir, 'jira')).rejects.toThrow('manifest.yaml');
  });

  it('throws a ZodError when manifest has enabled: "yes" (wrong type)', async () => {
    const orgDir = join(FIXTURES_DIR, 'wrong-type-manifest-org');
    await expect(loadModule(orgDir, 'jira')).rejects.toBeInstanceOf(ZodError);
  });
});

// ---------------------------------------------------------------------------
// loadOrgModules
// ---------------------------------------------------------------------------

describe('loadOrgModules', () => {
  it('returns [] for an org with no modules/ directory', async () => {
    const ctx = makeOrgContext('test-org');
    const modules = await loadOrgModules(ctx);
    expect(modules).toEqual([]);
  });

  it('returns exactly one module named "jira" with all parts populated', async () => {
    const ctx = makeOrgContext('one-jira-module-org');
    const modules = await loadOrgModules(ctx);

    expect(modules).toHaveLength(1);
    expect(modules[0]!.name).toBe('jira');
    expect(modules[0]!.manifest.tools).toHaveLength(4);
    expect(typeof modules[0]!.prompt).toBe('string');
    expect(modules[0]!.defaults).toBeDefined();
    expect(modules[0]!.vocabulary).toBeDefined();
  });
});
