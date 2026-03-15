# Billy

Self-hosted personal finance tracker. Track household expenses, bills, loans, and spending across multiple people.

## Running with Docker

### Quick start

```bash
mkdir -p data
docker compose up -d
```

Open http://localhost:3000

### On TrueNAS (or any server)

1. Create a folder for Billy data:
```bash
mkdir -p /mnt/tank/apps/billy/data
```

2. Create a `docker-compose.yml` in that folder:
```yaml
services:
  billy:
    image: rhysdock/billy:latest
    container_name: billy
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./data:/data
    environment:
      - DB_PATH=/data/billy.db
      - PORT=3000
```

3. Start it:
```bash
cd /mnt/tank/apps/billy
docker compose up -d
```

4. Open `http://your-server-ip:3000`

The SQLite database lives at `./data/billy.db`. Back it up by copying that file, or use the download/upload in Settings.

## API

### Authentication

Generate an API key from **Settings -> API Key**. Include it on every request:

```
X-API-Key: your-key-here
```

The `/api/settings` endpoint is always public.

### Endpoints

#### Expenses
```
GET    /api/expenses
POST   /api/expenses
PUT    /api/expenses/:id
DELETE /api/expenses/:id
```

#### Bill Entries
```
GET    /api/expenses/:id/entries
POST   /api/expenses/:id/entries
DELETE /api/expenses/:id/entries/:entryId
```

#### Log a bill (automation shortcut)
```
POST /api/log-bill
{ "name": "AGL Power", "amount": 187.50, "date": "2026-03-15", "notes": "March bill" }
```
Matches by expense name. Returns expense list if no match found.

#### Members
```
GET    /api/members
POST   /api/members
PUT    /api/members/:id
DELETE /api/members/:id
```

#### Loans
```
GET    /api/loans
POST   /api/loans
PUT    /api/loans/:id
DELETE /api/loans/:id
```

#### Payment Groups
```
GET    /api/payment-groups
POST   /api/payment-groups
PUT    /api/payment-groups/:id
DELETE /api/payment-groups/:id
POST   /api/payment-groups/:id/assign   { "expense_ids": [1, 2, 3] }
```

#### Summary
```
GET /api/summary
```

#### Settings
```
GET  /api/settings
POST /api/settings/generate-key
POST /api/settings/clear-key
```

#### Backup & Restore
```
GET  /api/backup
POST /api/restore
```

## Development

```bash
cd backend && npm install && node server.js
cd frontend && npm install && npm run dev
```
