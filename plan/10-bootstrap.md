# Plan 10: Bootstrap & main entrypoint

**TL;DR** `src/main.ts` orchestrates Steps 1–8 of [README §6](../README-v2.md) and runs the live loop.

**Depends on**: Plans 01–09.

## Steps

1. `src/core/bootstrap/bootstrap.ts`:
   - `async function bootstrap(): Promise<RunningOrgAgent>`
   - Steps in order:
     1. `orgContext = await loadOrgConfig()` (plan 01)
     2. `loadedModules = await loadOrgModules(orgContext)` (plan 03)
     3. `systemPrompt = composeSystemPrompt({ basePrompt: BASE_PROMPT, orgPrompt: orgContext.systemPrompt, modules: loadedModules })` (plan 04)
     4. `registry = new ToolRegistry()` (plan 05); `registerModules(loadedModules, orgContext.env, registry)` (plan 09)
     5. Resolve the Pi model from `orgContext.env` (`PI_MODEL_PROVIDER` defaults to `'anthropic'`, `PI_MODEL_NAME` defaults to `'claude-sonnet-4-20250514'`); call `getModel(provider, name)`. Then: `agent = await createAgent({ systemPrompt, tools: registry.list(), model })` (plan 05)
     6. `wa = await connectWhatsApp(orgContext)` (plan 06)
     7. `queue = new SequentialQueue<NormalizedMessage>(async (msg) => { const reply = await agent.sendMessage(msg.text); await wa.sendText(msg.from, reply); })` (plan 07)
     8. `wa.onMessage((msg) => queue.enqueue(msg))`
   - Returns `{ orgContext, wa, queue, agent, shutdown(): Promise<void> }`.
   - Startup banner (info log): `org=<slug> modules=[names] tools=[names]` — names only, never values.
2. `src/main.ts`:
   - Thin entrypoint:
     ```ts
     bootstrap()
       .then((running) => {
         const handle = async (sig: NodeJS.Signals) => {
           logger.info({ sig }, 'shutting down');
           await running.shutdown();
           process.exit(0);
         };
         process.once('SIGINT', handle);
         process.once('SIGTERM', handle);
       })
       .catch((err) => {
         logger.fatal({ err }, 'bootstrap failed');
         process.exit(1);
       });
     ```
3. `shutdown()` does (best-effort, with timeouts):
   - `queue.drain()` (bounded by e.g. 10s)
   - `wa.close()`
4. Ensure no project-global Pi auto-discovery is triggered (README §15) — verify Pi SDK is initialized only via `createAgent`.

## Files created

- `src/core/bootstrap/bootstrap.ts`
- `src/main.ts`

## Verification

1. `ORG=example npm run dev` boots end-to-end against a sandbox Jira (or one mocked at the network layer for the verification harness).
2. Walk through README §13:
   - WhatsApp message: "create a high priority ticket for login outage"
   - Jira issue created in the configured project.
   - Confirmation reply sent to WhatsApp.
3. Logs show only allowlisted tools at startup. Attempting (in a test) to invoke an unregistered tool name returns an "unknown tool" error from the agent layer, not from Jira.
4. Press Ctrl+C → graceful shutdown logs appear; process exits 0.
5. Bootstrap with a malformed `config.yaml` → process exits 1 with a clear fatal log.

## Out of scope

PM2 (plan 11), preprocessing (deferred).
