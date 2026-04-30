/**
 * LLM smoke test — GitHub Copilot via Pi SDK.
 * Run with: npx tsx scripts/verify-llm.ts
 * Sends one small real message and shows the response.
 */

import { createAgent } from '../src/core/agent-runtime/index.js';
import { getModel } from '@mariozechner/pi-ai';
import type { KnownProvider, Model } from '@mariozechner/pi-ai';

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  LLM SMOKE TEST — GitHub Copilot / Pi SDK');
  console.log('══════════════════════════════════════════════════════\n');

  const provider = 'github-copilot' as KnownProvider;
  const modelName = 'claude-sonnet-4.5';

  console.log(`  Provider: ${provider}`);
  console.log(`  Model:    ${modelName}`);
  console.log(`  Auth:     auth.json (OAuth token)\n`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (getModel as (p: KnownProvider, m: string) => Model<any>)(provider, modelName);

  const agent = await createAgent({
    systemPrompt: 'You are a test assistant. Reply concisely.',
    tools: [],
    model,
    env: {},
  });

  console.log('  Sending: "Reply with exactly: GITHUB_COPILOT_OK"');
  const startMs = Date.now();
  const reply = await agent.sendMessage('Reply with exactly: GITHUB_COPILOT_OK');
  const durationMs = Date.now() - startMs;

  console.log(`  Response (${durationMs}ms): ${reply.trim()}`);

  const verified = reply.includes('GITHUB_COPILOT_OK');
  console.log(`\n  ${verified ? '✓' : '?'} LLM call ${verified ? 'VERIFIED' : 'responded but unexpected reply'}`);

  console.log('\n══════════════════════════════════════════════════════');
  console.log(`  RESULT: ${verified ? '✓ LLM VERIFIED' : '? CHECK REPLY ABOVE'}`);
  console.log('══════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\n✗ LLM TEST FAILED:', err.message ?? err);
  process.exit(1);
});
