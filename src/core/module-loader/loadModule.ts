import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { ModuleManifestSchema, ModuleDefaultsSchema, ModuleVocabularySchema } from './schemas.js';
import type { LoadedModule } from '../../types/index.js';

async function readRequiredFile(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    throw new Error(`Module file not found: ${filePath}`);
  }
}

function parseRequiredYaml(content: string, filePath: string): unknown {
  try {
    return parseYaml(content);
  } catch (err) {
    throw new Error(`Failed to parse YAML at ${filePath}: ${(err as Error).message}`);
  }
}

export async function loadModule(orgRootDir: string, name: string): Promise<LoadedModule> {
  const moduleDir = join(orgRootDir, 'modules', name);
  const manifestPath = join(moduleDir, 'manifest.yaml');
  const promptPath = join(moduleDir, 'prompt.md');
  const defaultsPath = join(moduleDir, 'defaults.yaml');
  const vocabularyPath = join(moduleDir, 'vocabulary.yaml');

  // All four files are required — fail fast with the absolute path if any is missing
  const [manifestRaw, prompt, defaultsRaw, vocabularyRaw] = await Promise.all([
    readRequiredFile(manifestPath),
    readRequiredFile(promptPath),
    readRequiredFile(defaultsPath),
    readRequiredFile(vocabularyPath),
  ]);

  const manifest = ModuleManifestSchema.parse(parseRequiredYaml(manifestRaw, manifestPath));
  const defaults = ModuleDefaultsSchema.parse(parseRequiredYaml(defaultsRaw, defaultsPath));
  const vocabulary = ModuleVocabularySchema.parse(parseRequiredYaml(vocabularyRaw, vocabularyPath));

  return { name, manifest, prompt, defaults, vocabulary };
}
