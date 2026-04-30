# Plan 05: Pi agent runtime + tool registration

**TL;DR** Wrap the Pi SDK with an explicit tool registry. Pi sees only tools we register; unknown tool names rejected at startup ([README §7, §9, §20](../README-v2.md)).

**Depends on**: [Plan 01](01-scaffolding-and-config.md), [Plan 04](04-prompt-composition.md).

## Steps

1. Look up the exact Pi SDK npm package name and current API. Document the chosen version at the top of `createAgent.ts` as a comment. If the SDK is unclear, note it in the plan-execution PR description and ask before installing.
2. `src/types/index.ts` — extend with:
   ```ts
   export interface ToolDefinition<I = unknown, O = unknown> {
     name: string;
     description: string;
     inputSchema: import('zod').ZodType<I>;
     handler: (input: I) => Promise<O>;
   }
   ```
3. `src/core/agent-runtime/toolRegistry.ts`:
   - `BLOCKED_TOOL_NAMES = new Set(['read', 'write', 'edit', 'bash', 'shell', 'grep', 'find', 'glob', 'exec', 'spawn'])` (README §2.4, §10.4).
   - `class ToolRegistry`:
     - `register(tool: ToolDefinition): void` — throws if `BLOCKED_TOOL_NAMES.has(tool.name)`; throws on duplicate name.
     - `list(): ToolDefinition[]`
     - `get(name: string): ToolDefinition | undefined`
     - `names(): string[]`
4. `src/core/agent-runtime/assertToolsAllowed.ts`:
   - `assertToolsAllowed(requested: string[], available: string[]): void` — throws on any name in `requested` not in `available`, with a clear message listing offenders.
5. `src/core/agent-runtime/createAgent.ts`:
   - `createAgent({ systemPrompt, tools }: { systemPrompt: string; tools: ToolDefinition[] }): Promise<Agent>` where `Agent = { sendMessage(text: string): Promise<string> }`.
   - Instantiates a Pi session passing **only** the supplied tools; converts each `ToolDefinition` to the SDK's tool format (zod → JSON schema if required; use `zod-to-json-schema` if needed).
   - Maintain in-memory conversation state per agent instance (per README §3 — in-memory is fine for v1).
   - Do **not** auto-load any project-level Pi extensions (README §15). If the SDK supports disabling auto-discovery, do so explicitly.

## Files created

- `src/core/agent-runtime/toolRegistry.ts`
- `src/core/agent-runtime/assertToolsAllowed.ts`
- `src/core/agent-runtime/createAgent.ts`
- `src/types/index.ts` (extend)

## Verification

1. Unit test: register a dummy `echo` tool, `registry.list()` contains it.
2. Test: `registry.register({ name: 'bash', ... })` throws.
3. Test: registering same name twice throws.
4. Test: `assertToolsAllowed(['x'], ['y'])` throws; `assertToolsAllowed(['y'], ['x','y'])` passes.
5. Smoke test (mocked Pi SDK if needed): `createAgent({ systemPrompt: '...', tools: [echoTool] })` → `agent.sendMessage('hi')` returns a string.
6. Test: attempting to instantiate the agent with a tool whose name is in `BLOCKED_TOOL_NAMES` throws (defense in depth).

## Out of scope

Jira tools, WhatsApp, queue, bootstrap.
