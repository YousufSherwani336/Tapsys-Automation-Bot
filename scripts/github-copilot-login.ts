/**
 * GitHub Copilot device auth login script.
 * Run with: npx tsx scripts/github-copilot-login.ts
 *
 * Flow:
 *   1. Calls loginGitHubCopilot() device flow
 *   2. Prints the GitHub verification URL and user code
 *   3. You authenticate at github.com/login/device
 *   4. Saves credentials to auth.json (read by createAgent for all future runs)
 *
 * auth.json is in .gitignore — it is NEVER committed.
 */

import { loginGitHubCopilot } from '@mariozechner/pi-ai/oauth';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as readline from 'node:readline/promises';

const AUTH_PATH = join(process.cwd(), 'auth.json');

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  GITHUB COPILOT DEVICE AUTH — Pi SDK');
  console.log('══════════════════════════════════════════════════════\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const controller = new AbortController();

  try {
    const credentials = await loginGitHubCopilot({
      onPrompt: async ({ message, placeholder, allowEmpty }) => {
        // Prompt for GitHub Enterprise URL — press Enter to use github.com
        const answer = await rl.question(`  ${message} [${placeholder ?? ''}]: `);
        if (!answer && !allowEmpty) throw new Error('Input required');
        return answer;
      },

      onAuth: (url: string, instructions: string) => {
        // This is where the device code and URL are shown
        console.log('\n┌─────────────────────────────────────────────────┐');
        console.log('│        GITHUB DEVICE AUTH — ACTION REQUIRED     │');
        console.log('├─────────────────────────────────────────────────┤');
        console.log(`│  Open URL:   ${url.padEnd(36)} │`);
        console.log(`│  ${instructions.padEnd(49)} │`);
        console.log('├─────────────────────────────────────────────────┤');
        console.log('│  Waiting for authentication...                  │');
        console.log('└─────────────────────────────────────────────────┘\n');
      },

      onProgress: (msg: string) => {
        console.log(`  [auth] ${msg}`);
      },

      signal: controller.signal,
    });

    // Save to auth.json (same format createAgent expects)
    let existing: Record<string, unknown> = {};
    try {
      const raw = await readFile(AUTH_PATH, 'utf8');
      existing = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // No existing file — start fresh
    }

    existing['github-copilot'] = { type: 'oauth', ...credentials };
    await writeFile(AUTH_PATH, JSON.stringify(existing, null, 2), 'utf8');

    console.log(`\n  ✓ Credentials saved to: ${AUTH_PATH}`);
    console.log('  ✓ auth.json is git-ignored — will not be committed\n');
    console.log('══════════════════════════════════════════════════════');
    console.log('  RESULT: ✓ GITHUB COPILOT AUTH COMPLETE');
    console.log('══════════════════════════════════════════════════════\n');

  } catch (err) {
    console.error('\n✗ Auth failed:', (err as Error).message ?? err);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();
