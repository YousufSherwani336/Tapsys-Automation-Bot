import { readFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import dotenv from 'dotenv';
import { OrgConfigSchema } from './schema.js';
import type { OrgContext } from '../../types/index.js';

/**
 * Loads the org context for the org identified by `process.env.ORG`.
 *
 * @param orgsRoot - Absolute path to the orgs directory.
 *   Defaults to `<cwd>/orgs`. Pass a fixture path in tests.
 */
export async function loadOrgConfig(
  orgsRoot = resolve(process.cwd(), 'orgs'),
): Promise<OrgContext> {
  const slug = process.env['ORG'];
  if (!slug) {
    throw new Error('Missing required environment variable: ORG');
  }

  const rootDir = join(orgsRoot, slug);
  try {
    await access(rootDir);
  } catch {
    throw new Error(`Org directory not found: ${rootDir}`);
  }

  // Load and validate config.yaml — throws ZodError with field paths on schema mismatch
  const configPath = join(rootDir, 'config.yaml');
  let configRaw: string;
  try {
    configRaw = await readFile(configPath, 'utf-8');
  } catch {
    throw new Error(`Failed to read org config: ${configPath}`);
  }
  const configParsed: unknown = parseYaml(configRaw);
  const config = OrgConfigSchema.parse(configParsed);

  // Load .env into a scoped object — do NOT mutate global process.env
  const envPath = join(rootDir, '.env');
  // DotenvPopulateInput = Record<string,string>; pass directly to avoid global process.env mutation
  const scopedEnv: Record<string, string> = {};
  dotenv.config({ path: envPath, processEnv: scopedEnv });

  // Load system prompt
  const promptPath = join(rootDir, 'system-prompt.md');
  const systemPrompt = await readFile(promptPath, 'utf-8');

  return {
    slug,
    rootDir,
    sessionDir: join(rootDir, 'wa-session'),
    runtimeDir: join(rootDir, 'runtime'),
    config,
    env: scopedEnv,
    systemPrompt,
  };
}
