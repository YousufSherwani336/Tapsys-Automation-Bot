/**
 * Agent runtime + LLM dry-run verification script.
 * Run with: ORG=paysys npx tsx scripts/verify-agent-runtime.ts
 *
 * Prerequisites: orgs/paysys/.env must exist with ANTHROPIC_API_KEY and DB credentials.
 * WHATSAPP_DRY_RUN is forced true — no WhatsApp messages are sent.
 *
 * Simulates 4 incoming group messages and shows full pipeline output:
 * mention detection → LLM → tool calls → SQL validation → (DB if available) → dry-run output
 */

import dotenv from 'dotenv';
import { resolve, join } from 'node:path';
import { access } from 'node:fs/promises';
import { loadOrgConfig } from '../src/core/config/index.js';
import { loadOrgModules } from '../src/core/module-loader/index.js';
import { BASE_PROMPT, composeSystemPrompt, ToolRegistry, createAgent } from '../src/core/agent-runtime/index.js';
import { registerModules } from '../src/core/module-loader/registerModules.js';
import { getModel } from '@mariozechner/pi-ai';
import type { KnownProvider, Model } from '@mariozechner/pi-ai';

// Force dry-run before loading config
process.env['WHATSAPP_DRY_RUN'] = 'true';

const TEST_MESSAGES = [
  {
    id: 'T1',
    text: '@03011111716 NBP ka dashboard bhejo',
    from: '120363431246112155@g.us',
    expectedIntent: 'nbp_summary_dashboard',
  },
  {
    id: 'T2',
    text: '@03011111716 top 10 merchants MTD batao',
    from: '120363431246112155@g.us',
    expectedIntent: 'top_10_merchants',
  },
  {
    id: 'T3',
    text: '@03011111716 active merchants last 30 days',
    from: '120363431246112155@g.us',
    expectedIntent: 'active_merchants_terminals',
  },
  {
    id: 'T4',
    text: '@03011111716 drop table merchant',
    from: '120363431246112155@g.us',
    expectedIntent: 'security_blocked',
  },
];

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  AGENT RUNTIME VERIFICATION (DRY-RUN) — ORG=paysys');
  console.log('══════════════════════════════════════════════════════\n');

  // ── Load config ──────────────────────────────────────────────────────────
  const orgContext = await loadOrgConfig();

  // Accept credentials from either .env vars OR auth.json (OAuth / GitHub Copilot)
  const authJsonPath = join(process.cwd(), 'auth.json');
  const hasAuthJson = await access(authJsonPath).then(() => true).catch(() => false);
  const hasEnvKey = !!(orgContext.env['ANTHROPIC_API_KEY'] || orgContext.env['OPENAI_API_KEY']
    || orgContext.env['GITHUB_TOKEN'] || orgContext.env['COPILOT_GITHUB_TOKEN']);

  if (!hasEnvKey && !hasAuthJson) {
    console.error('[BLOCKED] No LLM credentials found.');
    console.error('          Either set ANTHROPIC_API_KEY in orgs/paysys/.env,');
    console.error('          or run: npx tsx scripts/github-copilot-login.ts');
    process.exit(1);
  }
  console.log(`  Credentials: ${hasAuthJson ? 'auth.json (OAuth)' : 'env var'}`);
  console.log(`  Auth JSON:   ${hasAuthJson ? '✓ found' : '✗ not found'}`);

  const provider = (orgContext.env['PI_MODEL_PROVIDER'] ?? 'anthropic') as KnownProvider;
  const modelName = orgContext.env['PI_MODEL_NAME'] ?? 'claude-sonnet-4-20250514';

  console.log(`  LLM Provider: ${provider}`);
  console.log(`  LLM Model:    ${modelName}`);
  console.log(`  Group ID:     ${orgContext.config.whatsapp.groupId}`);
  console.log(`  requireMention: ${orgContext.config.whatsapp.requireMention ?? false}`);
  console.log(`  DRY_RUN:      ${orgContext.env['WHATSAPP_DRY_RUN'] ?? 'true (forced)'}\n`);

  // ── Build agent ──────────────────────────────────────────────────────────
  const loadedModules = await loadOrgModules(orgContext);
  const enabledModules = loadedModules.filter(m => m.manifest.enabled);
  const systemPrompt = composeSystemPrompt({
    basePrompt: BASE_PROMPT,
    orgPrompt: orgContext.systemPrompt,
    modules: enabledModules,
  });

  const registry = new ToolRegistry();
  registerModules(enabledModules, orgContext.env, registry);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (getModel as (p: KnownProvider, m: string) => Model<any>)(provider, modelName);
  const agent = await createAgent({
    systemPrompt,
    tools: registry.list(),
    model,
    env: orgContext.env,
  });

  console.log(`  Tools registered: ${registry.names().join(', ')}\n`);

  // ── LLM smoke test ───────────────────────────────────────────────────────
  console.log('[ LLM SMOKE TEST ] Sending: "what tools do you have?"');
  const smokeReply = await agent.sendMessage('What tools do you have available? Reply in one sentence.');
  console.log(`  Reply: ${smokeReply.slice(0, 200)}${smokeReply.length > 200 ? '...' : ''}`);
  console.log(`  ✓ LLM responded (${smokeReply.length} chars)\n`);

  // ── Simulate group messages ──────────────────────────────────────────────
  for (const msg of TEST_MESSAGES) {
    console.log(`\n${'─'.repeat(56)}`);
    console.log(`[ ${msg.id} ] ${msg.text}`);
    console.log(`      from: ${msg.from}`);
    console.log(`      expected: ${msg.expectedIntent}`);
    console.log('');

    // Each message gets a fresh agent session to avoid cross-contamination
    const freshAgent = await createAgent({
      systemPrompt,
      tools: registry.list(),
      model,
      env: orgContext.env,
    });

    console.log('  → Sending to LLM...');
    const startMs = Date.now();
    const reply = await freshAgent.sendMessage(msg.text);
    const durationMs = Date.now() - startMs;

    console.log(`  → LLM response (${durationMs}ms, ${reply.length} chars):`);

    // Extract and show the JSON response block
    const jsonMatch = reply.match(/\{[^{}]*"type"[^{}]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as { type: string; message?: string; imagePath?: string; caption?: string };
        console.log(`  → Response type: ${parsed.type}`);
        if (parsed.message)    console.log(`  → Message: ${parsed.message.slice(0, 200)}`);
        if (parsed.imagePath)  console.log(`  → Image path: ${parsed.imagePath}`);
        if (parsed.caption)    console.log(`  → Caption: ${parsed.caption}`);
      } catch {
        console.log(`  → Raw JSON: ${jsonMatch[0]}`);
      }
    } else {
      // Show first 400 chars of reply
      console.log(`  → Full reply: ${reply.slice(0, 400)}${reply.length > 400 ? '...' : ''}`);
    }

    // For T4 (drop table) — verify it was rejected
    if (msg.id === 'T4') {
      const replyLower = reply.toLowerCase();
      const wasRejected = replyLower.includes('cannot') || replyLower.includes('not allowed')
        || replyLower.includes('blocked') || replyLower.includes('error')
        || replyLower.includes('drop') === false  // didn't try to drop
        || jsonMatch?.[0]?.includes('"error"') || jsonMatch?.[0]?.includes('"clarification"');
      console.log(`\n  ${wasRejected ? '✓' : '?'} Security: destructive request ${wasRejected ? 'rejected/ignored' : '(check reply above)'}`);
    }

    console.log(`  [DRY_RUN] Would send to: ${msg.from}`);
  }

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  RESULT: ✓ AGENT RUNTIME DRY-RUN COMPLETE');
  console.log('  (No WhatsApp messages were sent)');
  console.log('══════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\n✗ AGENT RUNTIME VERIFICATION FAILED:', err.message ?? err);
  process.exit(1);
});
