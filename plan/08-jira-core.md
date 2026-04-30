# Plan 08: Shared Jira core engine

**TL;DR** Reusable Jira client + operation set under `src/shared-modules/jira-core/`, with generic tool builders. Pure capability — no org-specific behavior ([README §5.2, §8.1](../README-v2.md)).

**Depends on**: [Plan 01](01-scaffolding-and-config.md). (Plan 05 not strictly required for client/ops, but `ToolDefinition` from plan 05 is needed for `toolBuilders.ts`. Sequence 05 before 08 in practice or stub the type.)

## Steps

1. Add dependency: `axios` (or `undici`/native fetch — pick one and document; `axios` is convenient for interceptors).
2. `src/shared-modules/jira-core/client.ts`:
   - `createJiraClient({ host, email, token }): JiraClient`
   - Auth: HTTP Basic with `email:token`, base URL `https://<host>/rest/api/3`.
   - Default timeout 15s; JSON Content-Type.
3. `src/shared-modules/jira-core/errors.ts`:
   - `class JiraError extends Error { code: 'auth' | 'not_found' | 'validation' | 'rate_limit' | 'unknown'; status: number; raw?: unknown; }`
   - `normalizeError(err): JiraError` — maps axios errors / Jira response shapes.
4. `src/shared-modules/jira-core/operations/`:
   - `createIssue.ts`: `createIssue(client, { project, summary, issueType, priority?, description?, assignee?, labels? })`
   - `getIssue.ts`: `getIssue(client, key)`
   - `searchIssues.ts`: `searchIssues(client, jql, { fields?, maxResults? })`
   - `updateIssue.ts`: `updateIssue(client, key, fields)`
   - `addComment.ts`: `addComment(client, key, body)`
   - `listTransitions.ts`: `listTransitions(client, key)`
   - `transitionIssue.ts`: `transitionIssue(client, key, transitionId)`
   - `attachFile.ts`: `attachFile(client, key, { filename, buffer, contentType })`
   - All wrap calls in try/catch → `normalizeError`.
5. `src/shared-modules/jira-core/toolBuilders.ts`:
   - For each operation, a factory `(ctx: { client, defaults, vocabulary }) => ToolDefinition` that:
     - Defines a `zod` `inputSchema` for the tool's args.
     - In `handler`, merges `defaults` into missing fields (e.g., `project ?? defaults.defaultProject`).
     - Applies `vocabulary` aliases (e.g., translate `"bug"` → `"Bug"` via `vocabulary.aliases.issueTypes`).
     - Calls the operation; returns a JSON-serializable result.
   - Export `JIRA_TOOL_BUILDERS: Record<string, (ctx) => ToolDefinition>` keyed by tool name:
     - `jira.create_issue`, `jira.get_issue`, `jira.search_issues`, `jira.update_issue`, `jira.add_comment`, `jira.list_transitions`, `jira.transition_issue`, `jira.attach_file`.
6. `src/shared-modules/jira-core/index.ts` re-exports the public API.

## Files created

- `src/shared-modules/jira-core/{client,errors,toolBuilders,index}.ts`
- `src/shared-modules/jira-core/operations/*.ts` (one file per operation)

## Verification

1. Unit tests with `nock` (or `msw-node`) mocking Jira REST:
   - `createIssue` posts to `/rest/api/3/issue` with the expected payload.
   - `searchIssues` posts JQL and returns the parsed `issues` array.
2. Test: 401 response → `JiraError` with `code: 'auth'`.
3. Test: 404 → `code: 'not_found'`. Test: 429 → `code: 'rate_limit'`.
4. Test: `JIRA_TOOL_BUILDERS['jira.create_issue']({ client, defaults: { defaultProject: 'EX', defaultIssueType: 'Task' }, vocabulary: { aliases: { issueTypes: { bug: 'Bug' } } } })` produces a `ToolDefinition`:
   - Calling its handler with `{ summary: 'x', issueType: 'bug' }` translates `bug → Bug` and uses `project: 'EX'` from defaults.
5. Test: handler validates input via `inputSchema` and rejects junk.

## Out of scope

Org allowlist (plan 09), registration into Pi (plan 09).
