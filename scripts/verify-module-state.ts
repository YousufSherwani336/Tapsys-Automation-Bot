/**
 * Integration verification script — module state check.
 * Run with: ORG=paysys npx tsx scripts/verify-module-state.ts
 *
 * Verifies without starting WhatsApp or hitting the DB:
 * - Which modules are loaded and enabled
 * - Which tools are registered
 * - That Jira is NOT in the tool list
 * - That the composed system prompt contains NBP content
 * - That the composed system prompt does NOT contain Jira instructions
 */

import { loadOrgConfig } from '../src/core/config/index.js';
import { loadOrgModules } from '../src/core/module-loader/index.js';
import { BASE_PROMPT, composeSystemPrompt } from '../src/core/agent-runtime/index.js';
import { ToolRegistry } from '../src/core/agent-runtime/index.js';
import { registerModules } from '../src/core/module-loader/registerModules.js';

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  MODULE STATE VERIFICATION — ORG=paysys');
  console.log('══════════════════════════════════════════════════════\n');

  // ── 1. Load org config ───────────────────────────────────────────────────
  console.log('[ 1/6 ] Loading org config...');
  const orgContext = await loadOrgConfig();
  console.log(`        slug:     ${orgContext.slug}`);
  console.log(`        groupId:  ${orgContext.config.whatsapp.groupId}`);
  console.log(`        requireMention: ${orgContext.config.whatsapp.requireMention ?? false}`);
  console.log(`        provider: ${orgContext.env['PI_MODEL_PROVIDER'] ?? '(not set)'}`);
  console.log(`        model:    ${orgContext.env['PI_MODEL_NAME'] ?? '(not set)'}`);

  // ── 2. Load modules ──────────────────────────────────────────────────────
  console.log('\n[ 2/6 ] Loading org modules...');
  const loadedModules = await loadOrgModules(orgContext);
  console.log(`        Loaded modules (${loadedModules.length}):`);
  for (const m of loadedModules) {
    console.log(`          • ${m.name}  (manifest tools: ${m.manifest.tools.length})`);
  }

  const enabledModules = loadedModules.filter(m => m.manifest.enabled);
  const disabledModules = loadedModules.filter(m => !m.manifest.enabled);
  console.log(`        Enabled:  ${enabledModules.map(m => m.name).join(', ') || '(none)'}`);
  console.log(`        Disabled: ${disabledModules.map(m => m.name).join(', ') || '(none)'}`);

  // ── 3. Register tools ────────────────────────────────────────────────────
  console.log('\n[ 3/6 ] Registering tools...');
  const registry = new ToolRegistry();
  registerModules(enabledModules, orgContext.env, registry);
  const tools = registry.names();
  console.log(`        Registered tools (${tools.length}):`);
  for (const t of tools) {
    console.log(`          ✓ ${t}`);
  }

  // ── 4. Check Jira is NOT present ─────────────────────────────────────────
  console.log('\n[ 4/6 ] Checking Jira is excluded...');
  const jiraTools = tools.filter(t => t.toLowerCase().includes('jira'));
  if (jiraTools.length > 0) {
    console.log(`  ✗ FAIL — Jira tools found: ${jiraTools.join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log('        ✓ No Jira tools in registry — Jira is disabled');
  }

  // ── 5. Compose and inspect system prompt ─────────────────────────────────
  console.log('\n[ 5/6 ] Composing system prompt (enabled modules only)...');
  const systemPrompt = composeSystemPrompt({
    basePrompt: BASE_PROMPT,
    orgPrompt: orgContext.systemPrompt,
    modules: enabledModules,  // only enabled modules
  });

  const promptLen = systemPrompt.length;
  const hasNBP        = /raast_thirdparty_records|aggregator_code.*00087/i.test(systemPrompt);
  // Must not contain the OLD active MPOS/TAPSYS SQL patterns (not just the "DISABLED" warning)
  const hasOldMPOS    = /TAPSYS\/MPOS SQL Server database|aggregator_code IN \('729'.*ENABLED|digital_onboarding_type\s*=\s*'MPOS'.*WHERE/i.test(systemPrompt)
                      || /You are a specialized.*TAPSYS\/MPOS/i.test(systemPrompt);
  const hasJiraInstr  = /## Module: jira/i.test(systemPrompt);
  const hasOldCatalog = /mpos-tapsys-regional-stats/i.test(systemPrompt);

  console.log(`        Prompt length: ${promptLen} characters`);
  console.log(`        Contains NBP/raast content:         ${hasNBP ? '✓ YES' : '✗ NO  ← FAIL'}`);
  console.log(`        Contains old MPOS/TAPSYS SQL:       ${hasOldMPOS ? '✗ YES ← FAIL' : '✓ NO'}`);
  console.log(`        Contains Jira tool instructions:    ${hasJiraInstr ? '✗ YES ← FAIL' : '✓ NO'}`);
  console.log(`        Contains old MPOS catalog name:     ${hasOldCatalog ? '✗ YES ← FAIL' : '✓ NO'}`);

  if (!hasNBP || hasOldMPOS || hasJiraInstr || hasOldCatalog) {
    process.exitCode = 1;
  }

  // ── 6. Show prompt section headers ───────────────────────────────────────
  console.log('\n[ 6/6 ] Composed prompt section headers:');
  const lines = systemPrompt.split('\n');
  for (const line of lines) {
    if (line.startsWith('##') || line.startsWith('# ')) {
      console.log(`          ${line}`);
    }
  }

  console.log('\n══════════════════════════════════════════════════════');
  if (process.exitCode === 1) {
    console.log('  RESULT: ✗ FAILED — see errors above');
  } else {
    console.log('  RESULT: ✓ ALL CHECKS PASSED');
  }
  console.log('══════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
