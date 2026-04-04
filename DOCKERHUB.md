# Billy

Self-hosted personal finance tracker for households. Track expenses, loans, savings goals, and spending across multiple people — with a clean UI and a full REST API.

## Quick Start

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

Open **http://your-server:4823**

## Features

- **Expenses** — recurring bills across any schedule (weekly → annually), categories, variable amounts
- **Loans** — amortization tracking, interest saved, time saved, repayment simulator with rate change modelling
- **Savings Goals** — target tracking with contribution schedules and projections
- **Members** — per-person splits, income tracking, expense-as-%-of-income
- **Dashboard** — totals, per-member breakdown, category breakdown, upcoming bills
- **API** — full REST API with Bearer token authentication
- **Backup & Restore** — one-click SQLite backup/restore from Settings

## Data

The SQLite database is stored at `/data/billy.db` inside the container. Mount a host directory to persist it across container updates.

## API

Generate an API key in **Settings → API Key** and include it on requests:

```
Authorization: Bearer your-key-here
```

See the full API reference inside the app at **Settings → API Reference**.

## Source

https://github.com/RhysHub/BillyFinance
