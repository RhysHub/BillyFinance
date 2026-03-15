# Billy 💰

A self-hosted personal finance app for tracking household expenses, bills, loans, and cost splits between members. Built to run on TrueNAS (or any Docker host).

![Docker](https://img.shields.io/badge/docker-rhysdock%2Fbilly-blue)

---

## Features

- **Expenses** — recurring bills with schedules (weekly, fortnightly, monthly, quarterly, annually, one-time, irregular)
- **Variable & irregular billing** — log actual bills, Billy averages them for budgeting
- **Cost splits** — split expenses between household members by percentage
- **Payment groups** — reusable split presets, update once and it applies everywhere
- **Members** — per-member monthly/weekly/fortnightly/annual cost breakdown
- **Loans** — mortgage/loan tracker with extra repayment simulator and payoff chart
- **Categories** — group expenses with colour-coded categories
- **Reports** — spending projections and category breakdowns
- **API** — REST API with optional key auth for automation (n8n, Claude, etc.)
- **Backup/Restore** — download and upload your SQLite database from the UI

---

## Quick Start (TrueNAS / Docker)

### 1. Create a data directory

```bash
mkdir -p /mnt/tank/apps/billy/data
```

### 2. Create a `docker-compose.yml`

```yaml
services:
  billy:
    image: rhysdock/billy:latest
    container_name: billy
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - /mnt/tank/apps/billy/data:/data
    environment:
      - DB_PATH=/data/billy.db
      - PORT=3000
      # Optional: protect all API endpoints with a key
      # - API_KEY=your-secret-key-here
```

### 3. Start it

```bash
docker compose up -d
```

### 4. Open Billy

```
http://your-server-ip:3000
```

---

## Migrating existing data

1. In Billy → Settings → **Download Backup**
2. Copy the `.db` file to your data directory:
```bash
scp billy-backup.db user@your-server:/mnt/tank/apps/billy/data/billy.db
```
3. Restart: `docker compose restart`

---

## API

Billy has a REST API for automation — useful for logging bills automatically from n8n, Claude, or any HTTP client.

### Authentication

Set an API key in Settings → API Key (or via `API_KEY` env var). Include it on all requests:

```
X-API-Key: your-key-here
```

If no key is configured, all endpoints are open.

### Log a bill by name

The main automation endpoint — finds an expense by name and adds a bill entry in one shot.

```bash
curl -X POST http://your-server:3000/api/expenses/log \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key" \
  -d '{"name": "Power", "amount": 187.50, "date": "2026-03-15", "notes": "AGL March"}'
```

If the name doesn't match, the response includes a list of all available expense names.

### Other endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/expenses` | List all expenses (supports `?q=name` search) |
| `POST` | `/api/expenses` | Create a new expense |
| `POST` | `/api/expenses/:id/entries` | Add a bill entry by expense ID |
| `GET` | `/api/members` | List members |
| `GET` | `/api/categories` | List categories |
| `GET` | `/api/payment-groups` | List payment groups |
| `GET` | `/api/summary` | Get cost summary |
| `GET` | `/api/backup` | Download database backup |

Full API documentation is also available in the app under **Settings → API Reference**.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Port to listen on |
| `DB_PATH` | `/data/billy.db` | Path to SQLite database |
| `API_KEY` | — | Optional API key (overrides DB-configured key) |

---

## Development

```bash
# Backend
cd backend && npm install && node server.js

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

Frontend runs on `:5173` and proxies API calls to `:3000`.

---

## Stack

- **Backend** — Node.js + Express + better-sqlite3
- **Frontend** — React 18 + Vite + Tailwind CSS + Recharts
- **Database** — SQLite (single file, easy to backup)
- **Container** — Docker multi-stage build
