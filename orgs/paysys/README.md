# Onboarding a new org

Follow these steps to add a new organisation to the platform.

## 1. Copy the template

```bash
cp -r orgs/_template orgs/<slug>
```

Replace `<slug>` with a short, lowercase identifier for the org (e.g. `acme`).

## 2. Fill in `config.yaml`

Open `orgs/<slug>/config.yaml` and set:

- `orgSlug` — must match the folder name `<slug>`.
- `whatsapp.groupId` — the WhatsApp group JID to restrict the bot to, or leave blank to respond to all DMs.
- `preprocessing.voice` / `preprocessing.image` — set to `true` to enable those preprocessors (requires the relevant API keys in `.env`).

## 3. Create `.env`

```bash
cp orgs/_template/.env.example orgs/<slug>/.env
```

Fill in the real secrets. **Never commit this file** — it is gitignored.

| Variable | Required | Description |
|---|---|---|
| `JIRA_HOST` | If Jira enabled | e.g. `https://acme.atlassian.net` |
| `JIRA_EMAIL` | If Jira enabled | Atlassian account email |
| `JIRA_TOKEN` | If Jira enabled | Atlassian API token |
| `OPENAI_API_KEY` | If preprocessing enabled | For voice/image preprocessing |

## 4. Write `system-prompt.md`

Edit `orgs/<slug>/system-prompt.md`. Describe:

- Who the assistant is and the org context.
- Projects, terminology, and naming conventions.
- Preferred tone and escalation rules.

## 5. Configure the Jira module

Edit files in `orgs/<slug>/modules/jira/`:

| File | Purpose |
|---|---|
| `manifest.yaml` | Enable/disable the module and list allowed tools |
| `defaults.yaml` | Default project key, issue type, priority |
| `vocabulary.yaml` | Aliases mapping user shorthand to Jira values |
| `prompt.md` | Org-specific Jira instructions injected into the prompt |

## 6. Start the agent

```bash
ORG=<slug> npm run dev
```

The process will validate `config.yaml`, load `.env`, and start listening on WhatsApp.
