# Plan 04: Prompt composition

**TL;DR** Pure function that composes the final system prompt from base + org + per-module prompts ([README §12](../README-v2.md)).

**Depends on**: [Plan 01](01-scaffolding-and-config.md), [Plan 03](03-module-loader.md).

## Steps

1. `src/core/agent-runtime/basePrompt.ts`:
   - Export `BASE_PROMPT: string` — platform-wide rules from README §12.1:
     - Be concise.
     - Ask clarifying questions when needed.
     - Do not assume missing critical details.
     - Use available tools instead of guessing.
     - You are a business agent; you have only the tools explicitly provided.
2. `src/core/agent-runtime/composePrompt.ts`:
   - Export `composeSystemPrompt({ basePrompt, orgPrompt, modules }: { basePrompt: string; orgPrompt: string; modules: LoadedModule[] }): string`.
   - Composition order:
     1. `basePrompt`
     2. `## Organization`\n + `orgPrompt`
     3. For each module (sorted by `name` for stable ordering): `## Module: <name>` + `modules[i].prompt`
   - Trim each section, normalize line endings to `\n`, single trailing newline at end.
   - Sections separated by a blank line.
3. No I/O in this file — pure function.

## Files created

- `src/core/agent-runtime/basePrompt.ts`
- `src/core/agent-runtime/composePrompt.ts`

## Verification

1. Unit test: snapshot the composed prompt for `orgs/example/` (base + org + jira).
2. Test: zero modules → output contains base + `## Organization` only, no `## Module:` headers.
3. Test: multiple modules → headers appear in alphabetical order regardless of input order.
4. Test: trims trailing whitespace from inputs; output ends with exactly one `\n`.
5. Test: pure — calling twice with same inputs returns identical strings.

## Out of scope

Pi SDK calls, tool registration.
