# Conventions

Every agent executing a plan in this folder MUST follow these conventions. They exist so that work from different agents composes cleanly without rework.

If a convention conflicts with a specific plan, the plan wins — but call out the deviation in the PR description.

---

## 1. Scope discipline

- Do **only** what the assigned plan says. No bonus features, no opportunistic refactors, no "while I'm here" cleanups in unrelated files.
- Do not invent new files, folders, or dependencies that the plan doesn't mention. If you believe one is needed, stop and ask.
- Do not modify files owned by another plan. If a shared file (e.g., `src/types/index.ts`, `package.json`) needs changes, make the **minimum** change required and document it in the PR.
- Never edit `README-v2.md` or files under `plan/` while executing a plan.

## 2. Language, runtime, tooling

- **Language**: TypeScript, `strict: true`. No `any` unless justified in a comment. Prefer `unknown` + narrowing.
- **Node**: 20+ LTS. Use built-in `node:` prefixed imports (`node:fs/promises`, `node:path`).
- **Module system**: whichever plan 01 chose. Do not mix.
- **Package manager**: `npm` (lockfile committed). Do not introduce `yarn` or `pnpm`.
- **Formatting/lint**: if a config exists in the repo, run it before committing. Do not add new linters/formatters mid-stream.

## 3. Dependencies

- Add a dependency only if the plan lists it or it is genuinely required to complete the plan. Justify any addition not listed.
- Pin versions with caret ranges (`^x.y.z`) unless a plan says otherwise.
- Prefer the libraries chosen by earlier plans (`zod`, `yaml`, `dotenv`, `pino`, `axios`, `vitest`, `@whiskeysockets/baileys`). Do not introduce parallel alternatives.

## 4. File & folder layout

- Follow [README-v2.md §4](../README-v2.md) folder structure exactly. Do not create new top-level folders.
- One concept per file. Filenames in `camelCase.ts` for modules, `PascalCase.ts` only for files exporting a single class as default.
- Each folder that has multiple files should have an `index.ts` that re-exports the public surface. Internal helpers stay un-exported.
- Tests live next to source as `<name>.test.ts`, OR under `tests/` mirroring `src/`. Pick one per plan and stick to it. Default: co-located `*.test.ts`.

## 5. Types

- All cross-module types live in `src/types/`. Plan-local types stay in the plan's own folder.
- Derive types from `zod` schemas via `z.infer<typeof Schema>` rather than hand-writing duplicates.
- Public functions have explicit return types. Internal helpers may infer.
- No type assertions (`as Foo`) without a comment explaining why narrowing failed.

## 6. Configuration & secrets

- Never hardcode credentials, tokens, hosts, JIDs, project keys, etc. They come from `orgContext.env` or `orgContext.config`.
- Never read `process.env` directly outside `src/core/config/`. Pass `orgContext` (or its sub-fields) explicitly.
- Never write to another org's folder. The only writable paths during runtime are `orgs/<currentSlug>/{wa-session,runtime}/`.
- `.env` files are never committed. Update `.env.example` (in `_template/` only) when adding a new required variable.

## 7. Logging

- Use `pino`. Create a child logger per subsystem with `org=<slug>` and `subsystem=<name>` bindings.
- Log levels:
  - `fatal`: process is about to exit
  - `error`: an operation failed; user/operator must know
  - `warn`: degraded but recoverable
  - `info`: lifecycle events (startup, shutdown, module loaded, tool registered)
  - `debug`: per-message detail; off by default
- **Never log secret values** (tokens, full env). Log names/keys only.
- **Never log full WhatsApp message bodies at info or above** — they may contain sensitive user data. `debug` only.

## 8. Errors

- Throw `Error` (or a domain subclass like `JiraError`) with a message that names the offending file/field/key. No silent failures.
- Validate at boundaries (config load, tool input). Inside a module, trust your types.
- Do not add try/catch for cases that "can't happen". Let it crash with a real stack.
- All async code uses `async/await`. No raw `.then()` chains except in `src/main.ts` and `SequentialQueue` internals.

## 9. Safety rules (non-negotiable)

These come from [README-v2.md §2.4, §9, §10, §20](../README-v2.md):

- **Coding-tool ban**: never register tools named `read`, `write`, `edit`, `bash`, `shell`, `grep`, `find`, `glob`, `exec`, `spawn` (or aliases). Plan 05's guard list is authoritative.
- **Allowlist, not blocklist**: tools are registered only if explicitly listed in an org's `manifest.yaml`.
- **Fail-closed**: unknown tool names, unknown module folder names, missing required env vars → throw at startup.
- **Explicit registration**: never auto-discover tools, never auto-load Pi project extensions.
- **Per-org isolation**: one process = one org. No code path may read another org's `.env`, session, or runtime.

## 10. Pi runtime rules

- Pi is initialized only via `createAgent` (plan 05). Do not call the SDK from anywhere else.
- The agent receives `{ systemPrompt, tools, model? }` and nothing else. `model` is resolved from `PI_MODEL_PROVIDER` / `PI_MODEL_NAME` env vars in the org's `.env`; `createAgent` has a default fallback. No global config files, no auto-loaded extensions.
- Tools are passed as `ToolDefinition[]`. Do not pass raw SDK tool objects through the system.

## 11. WhatsApp rules

- Baileys is touched only inside `src/core/whatsapp/`. No other file imports `@whiskeysockets/baileys`.
- Outgoing messages go through `wa.sendText`. No direct socket access elsewhere.
- WhatsApp session storage lives only at `orgs/<slug>/wa-session/`. Do not relocate.

## 12. Testing

- Framework: `vitest`.
- Each plan must add tests for the units it introduces. The plan's "Verification" section is the minimum bar.
- Mock external I/O (Jira HTTP, Pi SDK, Baileys socket). No test should hit a real network or require a real WhatsApp pairing.
- Fixtures for org folders go under `tests/fixtures/orgs/`. Do not reuse `orgs/example/` as a test fixture (it may have real-ish config).
- Tests must be deterministic. No `Date.now()` / random without seeding.

## 13. Async & concurrency

- The platform is single-message-at-a-time per org by design (plan 07). Do not introduce parallel processing of WhatsApp messages.
- Within a single message handler, parallel I/O (`Promise.all`) is fine and encouraged.
- All long-lived resources (WA socket, Pi session) are created once at bootstrap and reused.

## 14. Comments & docs

- Comment **why**, not **what**. The code shows what.
- Do not add JSDoc to every function. Add it where the contract is non-obvious or the function crosses a module boundary.
- Do not create new markdown docs (READMEs, design docs) unless a plan explicitly asks. Plans + code + `docs/RUNBOOK.md` are the only narrative artifacts.

## 15. Git & PRs

- One plan = one PR. PR title: `Plan NN: <plan title>`.
- PR description must include:
  - Link to the plan file.
  - Checklist of the plan's "Verification" items, each ticked with how it was verified.
  - Any deviations from the plan or these conventions, with justification.
  - List of new dependencies added.
- Commits inside the PR may be granular; squash on merge.
- Never use `git push --force`, `git reset --hard` on shared branches, or `--no-verify`.

## 16. When you are stuck

- Do not guess credentials, library APIs, or behavior. Look it up or ask.
- Do not silently broaden scope to work around an unclear requirement. Stop and ask.
- If a plan appears wrong or incomplete, write a short note in the PR; do not edit the plan file yourself.
