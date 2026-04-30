# Plan 01: Project scaffolding & config loader

**TL;DR** Initialize a TypeScript Node project, create the folder skeleton from [README-v2.md §4](../README-v2.md), and implement org identity + config loading (Step 1 of §6).

**Depends on**: nothing.

## Steps

1. Initialize repo:
   - `package.json` (Node 20+; pick `type: "module"` OR CommonJS and document the choice in the file header).
   - `tsconfig.json` with `strict: true`, `target: ES2022`, `moduleResolution: NodeNext` (or `Bundler` if using `tsx`).
   - `.gitignore` (ignore `node_modules/`, `dist/`, `orgs/*/.env`, `orgs/*/wa-session/`, `orgs/*/runtime/`).
   - `.editorconfig` (LF, utf-8, 2-space indent for TS/JSON/YAML).
2. Add deps:
   - Runtime: `zod`, `yaml`, `dotenv`, `pino`.
   - Dev: `typescript`, `tsx` (or `ts-node`), `@types/node`, `vitest`.
3. Create the folder skeleton **exactly** per README §4:
   - `src/core/{bootstrap,module-loader,agent-runtime,whatsapp,queue,config}/`
   - `src/preprocessors/{voice,image,attachments}/` (empty, just `.gitkeep`)
   - `src/shared-modules/{jira-core,common}/`
   - `src/types/`
   - `orgs/`
4. Define core types in `src/types/index.ts`:
   - `OrgContext` — `{ slug, rootDir, sessionDir, runtimeDir, config, env, systemPrompt }`
   - `OrgConfig` — zod-inferred type from the config schema
   - `ModuleManifest` (placeholder, filled by plan 03)
   - `ToolDefinition` (placeholder, filled by plan 05)
5. Implement `src/core/config/schema.ts`:
   - `OrgConfigSchema = z.object({ orgSlug: z.string(), whatsapp: z.object({ groupId: z.string().optional() }).optional(), memory: z.record(z.unknown()).optional(), preprocessing: z.record(z.unknown()).optional() })`
6. Implement `src/core/config/loadOrgConfig.ts`:
   - Reads `process.env.ORG` (required; throw if missing).
   - Resolves `orgs/<slug>/`; throw if not a directory.
   - Loads `config.yaml` via `yaml`, validates with `OrgConfigSchema`.
   - Loads `.env` via `dotenv.config({ path, processEnv: scopedEnv })` into a **scoped object** — do **NOT** mutate global `process.env` beyond the variables already present in this child process.
   - Loads `system-prompt.md` as raw string (UTF-8).
   - Returns a typed `OrgContext`.
7. Add npm scripts in `package.json`:
   - `build`: `tsc -p .`
   - `dev`: `tsx src/main.ts` (file will exist after plan 10; this is fine to add now)
   - `test`: `vitest run`
   - `start`: `node dist/main.js`

## Files created

- `package.json`, `tsconfig.json`, `.gitignore`, `.editorconfig`
- `src/types/index.ts`
- `src/core/config/schema.ts`
- `src/core/config/loadOrgConfig.ts`
- folder skeleton + `.gitkeep` files where folders are otherwise empty

## Verification

1. `npm run build` succeeds with strict TS, zero errors.
2. Unit test `loadOrgConfig` against a fixture in `tests/fixtures/orgs/test-org/`:
   - Missing `ORG` env var → throws with clear message.
   - `orgs/<slug>/` does not exist → throws with the resolved path.
   - Malformed `config.yaml` → throws zod validation error including the field path.
   - Valid input → returns `OrgContext` with all fields populated and the right types.
3. Folder skeleton matches README §4 (manual diff or test that asserts each path exists).

## Out of scope

Module loader, prompt composition, Pi runtime, WhatsApp, Jira, queue, bootstrap.
