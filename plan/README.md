# Implementation Plans — WhatsApp Org Agent Platform (v2)

These plans break the v2 architecture (see [../README-v2.md](../README-v2.md)) into small, sequenced tasks suitable for hand-off to a cheaper LLM (e.g., Sonnet). Each plan is self-contained: scope, exact files, steps, verification, and what is out of scope.

**Every executing agent must read and follow [CONVENTIONS.md](CONVENTIONS.md) before starting a plan.**

## Order & dependencies

| # | Plan | Depends on |
|---|---|---|
| 01 | [Project scaffolding & config loader](01-scaffolding-and-config.md) | — |
| 02 | [Org template & example org](02-org-template.md) | 01 |
| 03 | [Module discovery & manifest loader](03-module-loader.md) | 01, 02 |
| 04 | [Prompt composition](04-prompt-composition.md) | 01, 03 |
| 05 | [Pi agent runtime + tool registration](05-agent-runtime.md) | 01, 04 |
| 06 | [WhatsApp (Baileys) integration](06-whatsapp.md) | 01 |
| 07 | [Sequential in-memory queue](07-queue.md) | 06 |
| 08 | [Shared Jira core engine](08-jira-core.md) | 01 |
| 09 | [Org Jira module wiring](09-jira-org-adapter.md) | 03, 05, 08 |
| 10 | [Bootstrap & main entrypoint](10-bootstrap.md) | 01–09 |
| 11 | [PM2 config & e2e verification](11-pm2-and-e2e.md) | 10 |

## Hand-off instructions

- Assign one plan at a time. Do not start plan N+1 until plan N's verification passes.
- Each plan lists explicit verification steps — require these to be green before merging.
- Cross-cutting safety rules apply to every plan:
  - Never register coding tools (`read`/`write`/`edit`/`bash`/`grep`/`find`) — guard list lives in plan 05.
  - Tool registration is the only gate; never rely on prompt instructions to restrict capability.
  - Each org process loads only its own `.env`; never read another org's folder.
  - Reject unknown tool names at startup (fail-closed).

## Deferred (post-v1)

Per README §16, the following are intentionally excluded from the first version and are not in any plan:

- Preprocessing pipelines (`src/preprocessors/{voice,image,attachments}`) — slot in between WhatsApp normalize and queue enqueue when needed.
- Additional capability modules beyond Jira — repeat the plan 08 + 09 pattern.
- Memory persistence — Pi conversation memory is in-memory per README §3.
