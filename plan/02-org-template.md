# Plan 02: Org template & example org

**TL;DR** Create `orgs/_template/` and a working example org `orgs/example/` with all four Jira module files, so later plans have real fixtures to load.

**Depends on**: [Plan 01](01-scaffolding-and-config.md) (types, config schema).

## Steps

1. Create `orgs/_template/`:
   - `config.yaml` — documented fields:
     ```yaml
     orgSlug: REPLACE_ME
     whatsapp:
       groupId: ""           # optional; if set, only handle messages from this group/jid
     memory: {}              # optional, reserved
     preprocessing:          # optional, all off by default in v1
       voice: false
       image: false
     ```
   - `.env.example` listing required vars with comments:
     ```env
     # Jira (required if jira module enabled)
     JIRA_HOST=
     JIRA_EMAIL=
     JIRA_TOKEN=

     # Model / preprocessing API keys (optional)
     # OPENAI_API_KEY=
     ```
   - `system-prompt.md` — placeholder org-level prompt (see README §12.2 for intent).
   - `modules/jira/manifest.yaml`:
     ```yaml
     enabled: true
     tools:
       - jira.create_issue
       - jira.search_issues
       - jira.get_issue
       - jira.add_comment
     ```
   - `modules/jira/prompt.md` — placeholder Jira-specific instructions (see README §12.3).
   - `modules/jira/defaults.yaml`:
     ```yaml
     defaultProject: ""
     defaultIssueType: Task
     defaultPriority: Medium
     ```
   - `modules/jira/vocabulary.yaml`:
     ```yaml
     aliases:
       issueTypes: {}        # e.g., bug: Bug, story: Story
       statuses: {}          # e.g., done: Done, todo: "To Do"
       priorities: {}        # e.g., urgent: Highest
     ```
2. Create `orgs/example/` by copying `_template/`:
   - Set `orgSlug: example` in `config.yaml`.
   - Add `.env` (NOT committed — only `.env.example` is committed in the template; for `example/`, add a placeholder `.env` and ensure `.gitignore` excludes it).
   - Fill `defaultProject` with a placeholder like `EX`.
   - Add empty `wa-session/.gitkeep` and `runtime/.gitkeep`.
3. Add `orgs/_template/README.md` explaining how to onboard a new org:
   - Copy `_template/` to `<slug>/`
   - Fill `config.yaml`, `.env`, `system-prompt.md`
   - Edit `modules/jira/{manifest,defaults,vocabulary,prompt}.{yaml,md}`
   - Run with `ORG=<slug> npm run dev`
4. Confirm `.gitignore` (from plan 01) excludes:
   - `orgs/*/.env`
   - `orgs/*/wa-session/`
   - `orgs/*/runtime/`
   - But does NOT exclude `orgs/_template/.env.example`.

## Files created

- `orgs/_template/{config.yaml,.env.example,system-prompt.md,README.md}`
- `orgs/_template/modules/jira/{manifest.yaml,prompt.md,defaults.yaml,vocabulary.yaml}`
- `orgs/example/{config.yaml,.env,system-prompt.md}`
- `orgs/example/modules/jira/{manifest.yaml,prompt.md,defaults.yaml,vocabulary.yaml}`
- `orgs/example/{wa-session,runtime}/.gitkeep`

## Verification

1. `loadOrgConfig` from plan 01 successfully loads `ORG=example` with the placeholder `.env`.
2. All YAML files parse without error (add a smoke test that `yaml.parse` each file).
3. `git status` shows `orgs/example/.env` as ignored.
4. `orgs/_template/.env.example` IS tracked.

## Out of scope

Loading the module files (plan 03), wiring Jira (plans 08–09).
