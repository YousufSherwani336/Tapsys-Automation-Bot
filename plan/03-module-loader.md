# Plan 03: Module discovery & manifest loader

**TL;DR** Implement `src/core/module-loader/` to discover `orgs/<org>/modules/*`, parse all four module files, validate manifests, and produce a typed `LoadedModule[]` (Steps 2–3 of [README §6](../README-v2.md)).

**Depends on**: [Plan 01](01-scaffolding-and-config.md), [Plan 02](02-org-template.md).

## Steps

1. `src/core/module-loader/schemas.ts`:
   - `ModuleManifestSchema = z.object({ enabled: z.boolean(), tools: z.array(z.string()) })`
   - `ModuleDefaultsSchema = z.record(z.unknown())` (modules define their own shape; loader is permissive)
   - `ModuleVocabularySchema = z.record(z.unknown())`
2. `src/core/module-loader/discover.ts`:
   - `discoverModules(orgRootDir): string[]` — returns sub-folder names under `<orgRootDir>/modules/`.
   - Skip dotfiles and non-directories.
   - If `<orgRootDir>/modules/` doesn't exist → return `[]` (no modules is valid).
3. `src/core/module-loader/loadModule.ts`:
   - `loadModule(orgRootDir, name): Promise<LoadedModule>`
   - Reads `manifest.yaml`, `prompt.md`, `defaults.yaml`, `vocabulary.yaml`.
   - All four files are required; missing file → throw with the absolute path in the message.
   - Validates manifest with `ModuleManifestSchema`; validates `defaults`/`vocabulary` with their schemas.
   - Returns `LoadedModule = { name, manifest, prompt: string, defaults: Record<string, unknown>, vocabulary: Record<string, unknown> }`.
4. `src/core/module-loader/index.ts`:
   - `loadOrgModules(orgContext): Promise<LoadedModule[]>` — composes `discover` + `loadModule` for each.
   - Logs (via pino) the list of loaded module names at info level.
5. Extend `src/types/index.ts` with `LoadedModule` and `ModuleManifest` (inferred from zod).

## Files created

- `src/core/module-loader/{schemas,discover,loadModule,index}.ts`
- `src/types/index.ts` (extend)

## Verification

1. Unit test against `orgs/example/`:
   - Returns exactly one module named `jira`.
   - All four parts (`manifest`, `prompt`, `defaults`, `vocabulary`) populated.
   - `manifest.tools` contains the four entries from plan 02.
2. Test: removing `manifest.yaml` from a fixture module → throws with the missing-file path.
3. Test: malformed YAML → throws with file path in message.
4. Test: org with no `modules/` directory → returns `[]` without error.
5. Test: manifest with `enabled: "yes"` (wrong type) → zod throws.

## Out of scope

Tool registration, prompt composition, Pi runtime, adapter dispatch (plan 09).
