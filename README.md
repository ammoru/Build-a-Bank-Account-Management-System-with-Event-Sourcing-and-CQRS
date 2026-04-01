# Bank Account Management System (Event Sourcing + CQRS)

This project implements a bank account backend API using Event Sourcing and CQRS, plus a sample frontend to exercise all command/query/admin flows.

## Stack

- Backend: Node.js, TypeScript, Express, PostgreSQL
- Read model projection: asynchronous in-process projector
- Frontend sample: React + Vite
- Containerization: Docker + Docker Compose (app + db)

## Required Files Included

- `docker-compose.yml`
- `Dockerfile`
- `.env.example`
- `submission.json`
- `seeds/001_schema.sql`
- backend source code under `src/`
- sample frontend under `frontend/`

## Environment

Copy `.env.example` to `.env` and adjust values.

```env
API_PORT=8080
DATABASE_URL=postgresql://user:password@db:5432/bank_db
DB_USER=user
DB_PASSWORD=password
DB_NAME=bank_db
DB_PORT=5432
FRONTEND_API_BASE_URL=http://localhost:8080
```

## Run with Docker

```bash
docker-compose up --build
```

- App health: `GET /health`
- API base: `http://localhost:${API_PORT}/api`

## Run Frontend Locally

```bash
npm install
npm --prefix frontend install
npm --prefix frontend run dev
```

Set `frontend/.env` from `frontend/.env.example` if needed.

## API Endpoints

### Commands

- `POST /api/accounts`
- `POST /api/accounts/{accountId}/deposit`
- `POST /api/accounts/{accountId}/withdraw`
- `POST /api/accounts/{accountId}/close`

### Queries

- `GET /api/accounts/{accountId}`
- `GET /api/accounts/{accountId}/events`
- `GET /api/accounts/{accountId}/balance-at/{timestamp}`
- `GET /api/accounts/{accountId}/transactions?page=1&pageSize=10`

### Projections Admin

- `POST /api/projections/rebuild`
- `GET /api/projections/status`

## Snapshot Strategy

Snapshots are created when event number hits 51, 101, 151, ...

- This stores state up to previous boundary (`last_event_number = 50, 100, 150, ...`).
- Loader replays only events after `last_event_number`.
- This satisfies the required acceptance condition where snapshot `last_event_number` may be 50 or 51.

## Example Requests

Create account:

```http
POST /api/accounts
Content-Type: application/json

{
  "accountId": "acc-test-12345",
  "ownerName": "Jane Doe",
  "initialBalance": 0,
  "currency": "USD"
}
```

Deposit:

```http
POST /api/accounts/acc-test-12345/deposit
Content-Type: application/json

{
  "amount": 100.50,
  "description": "Initial deposit",
  "transactionId": "txn-1"
}
```

Withdraw:

```http
POST /api/accounts/acc-test-12345/withdraw
Content-Type: application/json

{
  "amount": 50.00,
  "description": "ATM",
  "transactionId": "txn-2"
}
```

## Notes

- Write model source of truth is the `events` table.
- Query endpoints read from projections only.
- Projections are idempotent with `processed_events` table.
- `projection_checkpoints` tracks lag for status endpoint.
