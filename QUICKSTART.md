# Nova Suite — Quick Start Guide

Get Nova Suite running in under 5 minutes.

## Prerequisites

- **Docker** and **Docker Compose** (v2+)
- **curl** or any HTTP client for testing
- (Optional) **Node.js 24+** for local development

## Step 1: Configure

```bash
cp .env.example .env
```

Edit `.env` and change at minimum:
- `POSTGRES_PASSWORD` — a strong random password
- `JWT_SECRET` — at least 32 characters of randomness

## Step 2: Start

```bash
docker compose up -d
```

This starts:
- **PostgreSQL 18** — database with schema auto-initialized
- **Nova Engine** — the API server on port 4000
- **Temporal** — workflow engine on port 7233
- **Temporal UI** — workflow dashboard on port 8080
- **Caddy** — reverse proxy on ports 80/443

## Step 3: Verify

Wait ~30 seconds for PostgreSQL to initialize, then:

```bash
curl http://localhost:4000/health
```

Expected response:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "checks": { "database": "connected" }
}
```

## Step 4: Authenticate

```bash
# Login as admin
curl -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email": "admin@acme.local", "password": "admin123"}'
```

Save the returned `token` — you'll need it for all subsequent requests.

```bash
export TOKEN="<paste-token-here>"
```

## Step 5: Explore the Service Catalog

```bash
# List categories
curl http://localhost:4000/api/catalog/categories \
  -H "Authorization: Bearer $TOKEN"

# List service items
curl http://localhost:4000/api/catalog/items \
  -H "Authorization: Bearer $TOKEN"
```

## Step 6: Submit a Request

```bash
# Submit a laptop request (as the regular user)
curl -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email": "user@acme.local", "password": "admin123"}'

# Use the user token
export USER_TOKEN="<paste-user-token>"

curl -X POST http://localhost:4000/api/requests \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "service_item_id": "d0000000-0000-0000-0000-000000000001",
    "form_data": {
      "os_preference": "macOS",
      "reason": "New hire starting next week",
      "urgency": "Expedited (1 week)"
    },
    "priority": "high"
  }'
```

## Step 7: Approve the Request

```bash
# As admin, list pending requests
curl http://localhost:4000/api/requests \
  -H "Authorization: Bearer $TOKEN"

# Approve it (replace <request-id>)
curl -X POST http://localhost:4000/api/requests/<request-id>/approve \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action": "approve", "notes": "Approved for new hire"}'
```

This automatically creates an incident for fulfillment.

## Step 8: Work the Incident

```bash
# List incidents
curl http://localhost:4000/api/incidents \
  -H "Authorization: Bearer $TOKEN"

# Assign and start working (replace <incident-id>)
curl -X PATCH http://localhost:4000/api/incidents/<incident-id> \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "status": "in_progress",
    "assigned_to": "b0000000-0000-0000-0000-000000000002"
  }'

# Add a work note
curl -X POST http://localhost:4000/api/incidents/<incident-id>/journal \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "entry_type": "work_note",
    "content": "Ordered MacBook Pro 16-inch, expected delivery in 3 days",
    "is_customer_visible": false
  }'

# Resolve
curl -X PATCH http://localhost:4000/api/incidents/<incident-id> \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "status": "resolved",
    "resolution_code": "fulfilled",
    "resolution_notes": "Laptop delivered and configured"
  }'
```

## Step 9: Explore the CMDB

```bash
# List CI classes
curl http://localhost:4000/api/cmdb/classes \
  -H "Authorization: Bearer $TOKEN"

# List configuration items
curl http://localhost:4000/api/cmdb/items \
  -H "Authorization: Bearer $TOKEN"

# Get a CI with its relationships
curl http://localhost:4000/api/cmdb/items/f0000000-0000-0000-0000-000000000004 \
  -H "Authorization: Bearer $TOKEN"

# Impact analysis — what depends on the Nova API?
curl "http://localhost:4000/api/cmdb/items/f0000000-0000-0000-0000-000000000004/impact?depth=3" \
  -H "Authorization: Bearer $TOKEN"
```

## Step 10: Browse the API Docs

Open your browser to:
```
http://localhost:4000/docs
```

The interactive Swagger UI lets you try every endpoint.

## Troubleshooting

| Problem                | Fix                                              |
|------------------------|--------------------------------------------------|
| Health check fails     | `docker compose logs postgres` — wait for init   |
| Port 5432 in use       | Change port mapping in `docker-compose.yml`      |
| Auth errors            | Check `JWT_SECRET` matches in `.env`             |
| Database reset needed  | `docker compose down -v && docker compose up -d` |

## Next Steps

- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for system design
- Customize the service catalog for your organization
- Build a frontend (Backstage.io recommended)
- Set up [High Availability](docs/HIGH_AVAILABILITY.md) for production
