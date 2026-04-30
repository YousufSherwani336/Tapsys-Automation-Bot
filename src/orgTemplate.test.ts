import { describe, it, expect, afterEach } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { loadOrgConfig } from './core/config/loadOrgConfig.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

/** Recursively collect all .yaml files under a directory */
async function collectYamlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectYamlFiles(full)));
    } else if (entry.isFile() && extname(entry.name) === '.yaml') {
      results.push(full);
    }
  }
  return results;
}

describe('org YAML smoke tests', () => {
  it.each(['_template', 'example'])(
    'all YAML files in orgs/%s parse without error',
    async (orgDir) => {
      const dir = resolve(ROOT, 'orgs', orgDir);
      const yamlFiles = await collectYamlFiles(dir);
      expect(yamlFiles.length).toBeGreaterThan(0);
      for (const file of yamlFiles) {
        const raw = await readFile(file, 'utf-8');
        expect(() => parseYaml(raw), `YAML parse failed: ${file}`).not.toThrow();
      }
    },
  );
});

describe('loadOrgConfig with orgs/example', () => {
  const savedOrg = process.env['ORG'];

  afterEach(() => {
    if (savedOrg === undefined) {
      delete process.env['ORG'];
    } else {
      process.env['ORG'] = savedOrg;
    }
  });

  it('loads the example org context with correct shape', async () => {
    process.env['ORG'] = 'example';
    const ctx = await loadOrgConfig(resolve(ROOT, 'orgs'));

    expect(ctx.slug).toBe('example');
    expect(ctx.config.orgSlug).toBe('example');
    expect(typeof ctx.systemPrompt).toBe('string');
    expect(ctx.systemPrompt.length).toBeGreaterThan(0);
    expect(ctx.rootDir).toContain('example');
    expect(ctx.sessionDir).toContain('wa-session');
    expect(ctx.runtimeDir).toContain('runtime');
    // .env values are loaded into scoped env
    expect(ctx.env['JIRA_HOST']).toBe('https://example.atlassian.net');
  });
});
