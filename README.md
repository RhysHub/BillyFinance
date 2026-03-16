# Billy

Self-hosted personal finance tracker. Track household expenses, bills, loans, savings goals, and spending across multiple people.

## Features

- **Expenses** — recurring bills with weekly/fortnightly/monthly/quarterly/annual/irregular schedules, category grouping, active/inactive toggle
- **Loans** — amortization tracking, configurable stat modules (interest saved, time saved, LTV, equity, daily interest, etc.), repayment simulator with lump sum and rate change modelling
- **Savings Goals** — track progress toward targets with contribution schedules and projections
- **Members** — per-person expense splits, income tracking, expense-as-%-of-income display
- **Dashboard** — monthly/annual totals, per-member breakdown, category pie chart, upcoming bills (next 60 days)
- **Payment Groups** — reusable split templates assignable across multiple expenses
- **Backup & Restore** — download/upload the SQLite database from Settings
- **API** — full REST API with Bearer token authentication for external automation

## Running with Docker

### Quick start

```bash
mkdir -p data
docker compose up -d
```

Open http://localhost:4823

### On a server

Create a `docker-compose.yml` anywhere and run it:

```yaml
services:
  billy:
    image: rhysdock/billy:latest
    container_name: billy
    restart: unless-stopped
    ports:
      - "4823:4823"
    volumes:
      - ./data:/data
    environment:
      - DB_PATH=/data/billy.db
      - PORT=4823
```

```bash
docker compose up -d
```

Open `http://your-server-ip:4823`

The SQLite database lives at `./data/billy.db`. Back it up from Settings, or by copying the file directly.

## API

### Authentication

Generate an API key from **Settings → API Key**. Include it on every request as a Bearer token:

```
Authorization: Bearer your-key-here
```

`/api/settings` and `/api/health` are always public.

### Endpoints

#### Health
```
GET  /api/health
```

#### Expenses
```
GET    /api/expenses          ?q= filter by name
GET    /api/expenses/:id
POST   /api/expenses
PUT    /api/expenses/:id
DELETE /api/expenses/:id
```

#### Bill Entries
```
GET    /api/expenses/:id/entries
POST   /api/expenses/:id/entries     { amount, date, notes? }
DELETE /api/expenses/:id/entries/:entryId
```

#### Log a bill (automation shortcut)
```
POST /api/expenses/log
{ "name": "AGL Power", "amount": 187.50, "date": "2026-03-15", "notes": "March bill" }
```
Matches by expense name (exact first, then partial). Returns available names if no match found.

#### Members
```
GET    /api/members
POST   /api/members          { name, color?, income_amount?, income_schedule? }
PUT    /api/members/:id
DELETE /api/members/:id
```
`income_schedule`: `WEEKLY` · `FORTNIGHTLY` · `MONTHLY` · `ANNUALLY`

#### Loans
```
GET    /api/loans
POST   /api/loans            { name, balance, interest_rate, balance_date?, initial_balance?, start_date?, loan_term_years?, monthly_payment?, extra_payment?, monthly_expense_id?, extra_expense_id?, linked_expense_ids? }
PUT    /api/loans/:id
DELETE /api/loans/:id
```

#### Savings Goals
```
GET    /api/savings-goals
POST   /api/savings-goals    { name, target_amount, current_amount?, current_amount_date?, monthly_contribution?, contribution_schedule?, contribution_expense_id?, color?, notes? }
PUT    /api/savings-goals/:id
DELETE /api/savings-goals/:id
```
`contribution_schedule`: `DAILY` · `WEEKLY` · `FORTNIGHTLY` · `MONTHLY` · `QUARTERLY` · `ANNUALLY`

#### Categories
```
GET    /api/categories
POST   /api/categories       { name, color?, icon? }
PUT    /api/categories/:id
DELETE /api/categories/:id
```

#### Payment Groups
```
GET    /api/payment-groups
POST   /api/payment-groups   { name, members?: [{ member_id, percentage }] }
PUT    /api/payment-groups/:id
DELETE /api/payment-groups/:id
POST   /api/payment-groups/:id/assign   { "expense_ids": ["id1", "id2"] }
```

#### Summary & Projections
```
GET /api/summary
GET /api/projections         ?months=12
```

#### Settings
```
GET    /api/settings
PUT    /api/settings/api-key    { key }
DELETE /api/settings/api-key
```

#### Backup & Restore
```
GET  /api/backup              downloads billy-backup-YYYY-MM-DD.db
POST /api/restore             body: raw .db file bytes
```

## Development

```bash
# Backend
cd backend && npm install
PORT=4823 DB_PATH=./data/billy.db node server.js

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

Frontend dev server runs on http://localhost:5173 and proxies `/api` to `http://localhost:4823`.
