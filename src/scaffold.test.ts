import { describe, it, expect } from 'vitest';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

const REQUIRED_PATHS = [
  'src/core/bootstrap',
  'src/core/module-loader',
  'src/core/agent-runtime',
  'src/core/whatsapp',
  'src/core/queue',
  'src/core/config',
  'src/preprocessors/voice',
  'src/preprocessors/image',
  'src/preprocessors/attachments',
  'src/shared-modules/jira-core',
  'src/shared-modules/common',
  'src/types',
  'orgs',
  'orgs/_template',
];

describe('folder skeleton (README §4)', () => {
  it.each(REQUIRED_PATHS)('exists: %s', async (rel) => {
    await expect(access(resolve(ROOT, rel))).resolves.toBeUndefined();
  });
});
