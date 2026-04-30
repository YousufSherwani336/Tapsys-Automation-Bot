# whatsapp-org-agent

Multi-org WhatsApp agent platform. Each organization gets its own isolated agent process with its own WhatsApp session, credentials, and enabled capabilities. The starter capability is Jira.

## Prerequisites

- Node.js 20+
- npm
- A WhatsApp account to link (one per org)
- Jira Cloud instance with an API token (if using the Jira module)
- PM2 (optional, for production multi-org deployment): `npm install -g pm2`

## Install

```sh
git clone <repo-url>
cd whatsapp-org-agent
npm install
```

## Build

```sh
npm run build
```

## Test

```sh
npm test
```

## Setting up an org

1. Copy the template:

```sh
cp -r orgs/_template orgs/<slug>
```

2. Edit `orgs/<slug>/config.yaml`:

```yaml
orgSlug: <slug>
whatsapp:
  groupId: ""    # leave empty for all messages, or set a specific JID
```

3. Create `orgs/<slug>/.env` from the example:

```sh
cp orgs/_template/.env.example orgs/<slug>/.env
```

Fill in the values:

```env
JIRA_HOST=your-instance.atlassian.net
JIRA_EMAIL=service-account@example.com
JIRA_TOKEN=your-atlassian-api-token

# Optional — defaults to anthropic / claude-sonnet-4-20250514
# PI_MODEL_PROVIDER=anthropic
# PI_MODEL_NAME=claude-sonnet-4-20250514
```

4. Edit `orgs/<slug>/system-prompt.md` with your org's personality and context.

5. Configure the Jira module in `orgs/<slug>/modules/jira/`:

| File | Purpose |
|---|---|
| `manifest.yaml` | Enable/disable module, list allowed tools |
| `defaults.yaml` | Default project key, issue type, priority |
| `vocabulary.yaml` | Alias mappings (e.g. `bug` → `Bug`) |
| `prompt.md` | Org-specific Jira instructions for the agent |

6. Create runtime directories:

```sh
mkdir -p orgs/<slug>/wa-session
mkdir -p orgs/<slug>/runtime/logs
```

## Running a single org

```sh
ORG=<slug> npm run dev
```

On first run, a QR code will appear in the terminal. Scan it with WhatsApp to link the device. Subsequent runs reconnect automatically.

## Running multiple orgs with PM2

1. Add your org to `pm2.config.js`:

```js
{
  name: '<slug>-agent',
  script: 'dist/main.js',
  env: { ORG: '<slug>' },
  instances: 1,
  exec_mode: 'fork',
  max_memory_restart: '500M',
  out_file: 'orgs/<slug>/runtime/logs/out.log',
  error_file: 'orgs/<slug>/runtime/logs/err.log',
  time: true,
}
```

2. Build and start:

```sh
npm run build
npm run start:pm2
```

3. Check status:

```sh
pm2 status
```

4. View logs for one org:

```sh
pm2 logs <slug>-agent
```

5. Stop all:

```sh
npm run stop:pm2
```

## Available Jira tools

These can be enabled per-org in `manifest.yaml`:

| Tool name | Description |
|---|---|
| `jira.create_issue` | Create a new issue |
| `jira.get_issue` | Get an issue by key |
| `jira.search_issues` | Search with JQL |
| `jira.update_issue` | Update issue fields |
| `jira.add_comment` | Add a comment |
| `jira.list_transitions` | List workflow transitions |
| `jira.transition_issue` | Move issue to a new state |
| `jira.attach_file` | Attach a file to an issue |

Only tools listed in the org's `manifest.yaml` are available to the agent. Unlisted tools cannot be called.

## Project structure

```
src/
  core/
    bootstrap/       # startup orchestration
    config/          # org config + env loading
    module-loader/   # discovers and loads org modules
    agent-runtime/   # Pi agent, tool registry, prompt composition
    whatsapp/        # Baileys connection, normalize, send
    queue/           # sequential message processing
  shared-modules/
    jira-core/       # reusable Jira client, operations, tool builders
  types/             # shared TypeScript types

orgs/
  _template/         # copy this to create a new org
  example/           # working example org
```

## Key commands

| Command | Description |
|---|---|
| `npm run build` | Compile TypeScript |
| `npm run dev` | Run with `tsx` (requires `ORG` env var) |
| `npm test` | Run all tests |
| `npm start` | Run compiled JS (requires `ORG` env var) |
| `npm run start:pm2` | Start all orgs via PM2 |
| `npm run stop:pm2` | Stop all PM2 processes |
| `npm run logs` | Stream all PM2 logs |
