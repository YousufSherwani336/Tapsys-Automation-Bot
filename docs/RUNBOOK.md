# Runbook — whatsapp-org-agent

Operational guide for running and maintaining the multi-org WhatsApp agent platform.

---

## Prerequisites

- Node.js 20+ LTS
- PM2 installed globally: `npm install -g pm2`
- Each org's `.env` file populated (copy `.env.example`, fill in values)

---

## Adding a new org

1. Copy the template folder:

   ```sh
   cp -r orgs/_template orgs/<slug>
   ```

2. Edit `orgs/<slug>/config.yaml` — set `orgSlug` to `<slug>`.

3. Edit `orgs/<slug>/system-prompt.md` — write the org's system prompt.

4. Copy `orgs/_template/.env.example` to `orgs/<slug>/.env` and fill in all required values:

   ```
   JIRA_HOST=<your-instance>.atlassian.net
   JIRA_EMAIL=<service-account-email>
   JIRA_TOKEN=<atlassian-api-token>
   ```

5. Edit `orgs/<slug>/modules/jira/defaults.yaml` — set `defaultProject`, `defaultIssueType`, `defaultPriority`.

6. Edit `orgs/<slug>/modules/jira/vocabulary.yaml` — add any term aliases your team uses.

7. Edit `orgs/<slug>/modules/jira/prompt.md` — add Jira-specific instructions for the agent.

8. Add a new entry in `pm2.config.js`:

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

9. Create the runtime log directory:

   ```sh
   mkdir -p orgs/<slug>/runtime/logs
   mkdir -p orgs/<slug>/wa-session
   ```

---

## Build & start

```sh
npm run build
npm run start:pm2
```

Check all agents are online:

```sh
pm2 status
```

---

## View per-org logs

Stream logs for a specific org:

```sh
pm2 logs <slug>-agent
```

Stream all agents:

```sh
npm run logs
# or: pm2 logs
```

---

## Restart one org

```sh
pm2 restart <slug>-agent
```

---

## Stop all agents

```sh
npm run stop:pm2
```

---

## Rotate a WhatsApp session (re-scan QR)

A new QR code is needed when the session expires or a new device pairing is required.

1. Stop the agent:

   ```sh
   pm2 stop <slug>-agent
   ```

2. Delete the session files:

   ```sh
   rm -rf orgs/<slug>/wa-session/*
   ```

3. Restart the agent (a QR code will print to the log):

   ```sh
   pm2 restart <slug>-agent
   pm2 logs <slug>-agent
   ```

4. Scan the QR code with the WhatsApp mobile app linked to the org's number.

---

## Health checklist

Run through this checklist to confirm an agent is healthy:

| Check | Command |
|---|---|
| Process is online | `pm2 status` |
| No error spikes | `pm2 logs <slug>-agent --err --lines 50` |
| Startup banner logged | `pm2 logs <slug>-agent --lines 100 \| grep "bootstrap complete"` |
| Tools registered | Look for `tools=[...]` in the bootstrap log line |
| Last message processed | `pm2 logs <slug>-agent --lines 50 \| grep "processing message"` |

---

## Two-org isolation test

Verifies that two org agents run independently with no cross-contamination.

**Setup:**

1. Configure both `orgs/example` and `orgs/example2` with their own `.env` files pointing to different Jira projects (or instances).
2. Build and start: `npm run build && npm run start:pm2`
3. Confirm both show `online` in `pm2 status`.

**Test steps:**

1. Send the same message ("create a high priority bug for login outage") to both org WhatsApp numbers.
2. Verify two independent Jira issues were created — one in each project.
3. Confirm PM2 logs show `org=example` and `org=example2` labels on separate lines.
4. Stop one agent: `pm2 stop example-agent`.
5. Confirm `example2-agent` continues to respond to messages.
6. Restart: `pm2 restart example-agent`.

**Expected outcome:** Each agent operates entirely within its own org boundary. Stopping or restarting one has zero effect on the other.
