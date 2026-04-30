# Plan 09: Org Jira module wiring (adapter + dispatch)

**TL;DR** Bridge between org-local Jira module (manifest/defaults/vocabulary/prompt) and the shared Jira engine; register only allowlisted tools ([README §5.3, §6 step 5, §9](../README-v2.md)).

**Depends on**: [Plan 03](03-module-loader.md), [Plan 05](05-agent-runtime.md), [Plan 08](08-jira-core.md).

## Steps

1. `src/shared-modules/jira-core/orgAdapter.ts`:
   - `applyJiraModule({ loadedModule, orgEnv, registry }: { loadedModule: LoadedModule; orgEnv: Record<string, string>; registry: ToolRegistry }): void`
   - If `loadedModule.manifest.enabled === false`, return without registering anything (log info).
   - Read `JIRA_HOST`, `JIRA_EMAIL`, `JIRA_TOKEN` from `orgEnv`; throw a clear error if any missing (since module is enabled).
   - Construct client via `createJiraClient`.
   - Build `ctx = { client, defaults: loadedModule.defaults, vocabulary: loadedModule.vocabulary }`.
   - For each tool name in `manifest.tools`:
     - Look up builder in `JIRA_TOOL_BUILDERS`.
     - If missing → throw with the offending name and the list of supported names (fail-closed; README §9.3).
     - Call builder with `ctx`; `registry.register(tool)`.
2. `src/core/module-loader/adapters.ts`:
   - `MODULE_ADAPTERS: Record<string, AdapterFn>` where:
     - `AdapterFn = (args: { loadedModule: LoadedModule; orgEnv: Record<string, string>; registry: ToolRegistry }) => void`
     - `MODULE_ADAPTERS.jira = applyJiraModule`
   - Future modules slot in here without changes elsewhere.
3. `src/core/module-loader/registerModules.ts`:
   - `registerModules(loadedModules: LoadedModule[], orgEnv, registry): void`
   - For each module: look up `MODULE_ADAPTERS[module.name]`; if missing → throw (unknown module type — fail-closed).
   - Call adapter.
4. Logging: at info level, log `module=<name> registered tools=[...]` after each adapter completes.

## Files created

- `src/shared-modules/jira-core/orgAdapter.ts`
- `src/core/module-loader/adapters.ts`
- `src/core/module-loader/registerModules.ts`

## Verification

1. Unit test: `orgs/example/` with `manifest.tools = ['jira.create_issue', 'jira.search_issues']`:
   - `registry.names()` returns exactly those two.
   - `jira.delete_issue` (or any other operation) is NOT in the registry, even though the builder may exist.
2. Test: manifest contains `jira.nonexistent` → throws at startup with the offending name.
3. Test: `enabled: false` → registry unchanged; no client created (mock `createJiraClient` to assert not called).
4. Test: missing `JIRA_TOKEN` while jira is enabled → throws with a clear message.
5. Test: unknown module folder name (e.g., `modules/foo/`) → `registerModules` throws.

## Out of scope

Bootstrap wiring (plan 10), runtime execution (plan 10).
