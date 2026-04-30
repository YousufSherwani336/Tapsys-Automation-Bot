# Plan 11: PM2 config & end-to-end verification

**TL;DR** Operational config to run multiple org processes; documented runbook; two-org isolation test ([README §17](../README-v2.md)).

**Depends on**: [Plan 10](10-bootstrap.md).

## Steps

1. `pm2.config.js`:
   ```js
   module.exports = {
     apps: [
       {
         name: 'example-agent',
         script: 'dist/main.js',
         env: { ORG: 'example' },
         instances: 1,
         exec_mode: 'fork',
         max_memory_restart: '500M',
         out_file: 'orgs/example/runtime/logs/out.log',
         error_file: 'orgs/example/runtime/logs/err.log',
         time: true,
       },
       // add one entry per org here
     ],
   };
   ```
2. Add npm scripts:
   - `start:pm2`: `pm2 start pm2.config.js`
   - `stop:pm2`: `pm2 stop pm2.config.js`
   - `logs`: `pm2 logs`
3. Create a second org `orgs/example2/` (copy of `example/`, different slug, different `.env` with a different Jira instance or project) **only for the isolation test** — do not commit secrets.
4. Add `pm2.config.js` entry for `example2-agent`.
5. `docs/RUNBOOK.md` covering:
   - Add a new org (copy `_template/`, fill `.env`, add to `pm2.config.js`).
   - Build & start: `npm run build && npm run start:pm2`.
   - Per-org logs: `pm2 logs example-agent`.
   - Restart one org: `pm2 restart example-agent`.
   - Rotate WA session: stop process, delete `orgs/<slug>/wa-session/`, restart, re-scan QR.
   - Health checklist (process status, log tail, last-message timestamp).
6. End-to-end isolation test (manual, recorded in PR):
   - Both orgs configured and running under PM2.
   - Each got its own QR / session on first start.
   - Send the same message to both org WA numbers → two independent Jira tickets in two different projects (or instances).
   - `pm2 stop example-agent` → `example2-agent` continues to respond.
   - Inspect `pm2 logs`: each app's logs are tagged with its own `org=<slug>`.

## Files created

- `pm2.config.js`
- `docs/RUNBOOK.md`
- (test-only, not committed) `orgs/example2/` for the isolation walkthrough

## Verification

1. `pm2 start pm2.config.js` brings up all configured org apps; `pm2 status` shows them online.
2. `pm2 logs example-agent` shows that org's logs only.
3. Manual two-org isolation test passes (steps above).
4. Killing one org (`pm2 delete example-agent`) does not affect the other.
5. `max_memory_restart` triggers restart under simulated memory pressure (optional).

## Out of scope

Preprocessing pipelines (deferred per README §16); cross-org orchestration (intentionally not part of this architecture).
