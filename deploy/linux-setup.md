# Linux Deployment Guide — Paysys WhatsApp Data Reporting Agent

**Target OS:** Ubuntu 22.04 LTS / Debian 12 (or any systemd-based Linux)
**Node version:** 20.x (LTS)

---

## 1. System Dependencies

### 1a. Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version   # must be >= 20.0.0
```

### 1b. canvas (node-canvas) native build dependencies

`canvas` uses Cairo for PNG rendering. Install the system libraries before `npm install`:

```bash
sudo apt-get install -y \
  build-essential \
  libcairo2-dev \
  libpango1.0-dev \
  libjpeg-dev \
  libgif-dev \
  librsvg2-dev \
  pkg-config \
  python3
```

### 1c. better-sqlite3 native build dependencies

Included in `build-essential` above. Also ensure `python3` is present (used by node-gyp).

### 1d. Optional: PM2 process manager

```bash
sudo npm install -g pm2
pm2 startup systemd   # follow the printed command to enable on boot
```

---

## 2. Create Dedicated User

Run the agent as a non-root user:

```bash
sudo useradd -r -m -s /usr/sbin/nologin -d /opt/whatsapp-agent whatsapp-agent
sudo mkdir -p /opt/whatsapp-agent
sudo chown whatsapp-agent:whatsapp-agent /opt/whatsapp-agent
```

---

## 3. Deploy Application

```bash
# As your own user or root — copy project files
sudo cp -r /path/to/whatsapp-pi-agent-main /opt/whatsapp-agent
sudo chown -R whatsapp-agent:whatsapp-agent /opt/whatsapp-agent

# Switch to deploy user
sudo -u whatsapp-agent bash

cd /opt/whatsapp-agent

# Install dependencies (with native compilation)
npm install

# If canvas fails to compile, try:
# npm install --build-from-source canvas

# Build TypeScript
npm run build
```

---

## 4. Configure Environment

```bash
cd /opt/whatsapp-agent
cp orgs/paysys/.env.example orgs/paysys/.env
nano orgs/paysys/.env   # fill in real values
```

Minimum required values in `orgs/paysys/.env`:

```
ANTHROPIC_API_KEY=sk-ant-...your-real-key...
DB_OPENMMS_HOST=192.168.196.9
DB_OPENMMS_PORT=1440
DB_OPENMMS_NAME=OPENMMS
DB_OPENMMS_USER=sreuser
DB_OPENMMS_PASS=your-real-password
WHATSAPP_DRY_RUN=false   # set false ONLY after first successful QR scan
```

---

## 5. First Run (QR Code Scan)

The first startup requires scanning a WhatsApp QR code. Run interactively:

```bash
cd /opt/whatsapp-agent
export ORG=paysys
# Load env
set -a; source orgs/paysys/.env; set +a
# Start with dry-run still on to test without sending messages
WHATSAPP_DRY_RUN=true node dist/main.js
```

Scan the QR code printed to stdout with the WhatsApp phone that should be the bot account.
The session is saved to `orgs/paysys/runtime/auth/` — subsequent starts are automatic.

After successful scan, stop the process (`Ctrl+C`) and set `WHATSAPP_DRY_RUN=false` in `.env`.

---

## 6a. Deploy with PM2

```bash
cd /opt/whatsapp-agent

# Start
pm2 start pm2.config.cjs --only paysys-agent

# Save process list for auto-restart
pm2 save

# Check status
pm2 status
pm2 logs paysys-agent --lines 50
```

---

## 6b. Deploy with systemd (alternative)

```bash
# Copy service file
sudo cp /opt/whatsapp-agent/deploy/paysys-agent.service /etc/systemd/system/

# Reload and enable
sudo systemctl daemon-reload
sudo systemctl enable paysys-agent
sudo systemctl start paysys-agent

# Check status
sudo systemctl status paysys-agent
sudo journalctl -u paysys-agent -f
```

---

## 7. Runtime Directory Structure

After first run, the following directories will be created automatically:

```
/opt/whatsapp-agent/
  orgs/paysys/
    .env                        ← real credentials (never commit)
    runtime/
      auth/                     ← Baileys WhatsApp session (never commit)
      logs/
        out.log
        err.log
  output/reports/               ← generated PNG reports (ephemeral)
  data/
    memory.sqlite               ← SQLite per-user memory store
  logs/
    audit.log                   ← query audit log
```

---

## 8. Health Check

```bash
# Check if agent is running
pm2 status paysys-agent          # or: systemctl status paysys-agent

# Test DB connectivity (safe SELECT 1)
# Send "system status" to the bot in the NBP WhatsApp group — it will reply with DB ping result

# Check last 20 log lines
pm2 logs paysys-agent --lines 20
# or
sudo journalctl -u paysys-agent -n 20
```

---

## 9. Upgrade Procedure

```bash
sudo -u whatsapp-agent bash
cd /opt/whatsapp-agent

# Pull new code
git pull

# Rebuild
npm install
npm run build

# Restart
pm2 restart paysys-agent
# or: sudo systemctl restart paysys-agent
```

---

## 10. Troubleshooting

| Symptom | Check |
|---------|-------|
| `canvas` fails to build | Run `sudo apt-get install -y libcairo2-dev libpango1.0-dev libjpeg-dev` then `npm rebuild canvas` |
| `better-sqlite3` build error | Run `npm rebuild better-sqlite3` |
| QR code not showing | Check stdout — ensure you're running interactively, not backgrounded |
| DB connection timeout | Verify `DB_OPENMMS_HOST`, `DB_OPENMMS_PORT`, firewall rules from Linux host to `192.168.196.9:1440` |
| "Missing DB password" error at startup | `DB_OPENMMS_PASS` is empty in `.env` — fill it in |
| Messages not sending | `WHATSAPP_DRY_RUN=true` is still set — change to `false` after testing |
| Session expired / QR loop | Delete `orgs/paysys/runtime/auth/` and re-scan QR |
