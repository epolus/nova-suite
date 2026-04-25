<div align="center">
  <img src="packages/nova-web/public/default-logo.svg" width="10%">
<h1>Nova Suite</h1>
</div>


**Open-source IT Service Management (ITSM) platform.**

Nova Suite provides a complete service management solution — service catalog, incident management, CMDB, workflow automation, SSO, and a modern admin dashboard — all with built-in multi-tenancy and row-level security.

## Features

### User Portal
- Self-service catalog with dynamic request forms and CMDB reference fields
- Shopping cart for multi-item requests
- Approval workflows with manager-based routing
- Real-time request status tracking
- Personal task views (My Todo, My Groups)

### Incident Management
- Full incident lifecycle (new → in progress → resolved → closed)
- SLA tracking with configurable breach actions
- Priority matrix with impact/urgency calculation
- Assignment to users and groups
- Journal / activity log with comments and work notes
- Default "active" filter (excludes closed) for efficient triage

### CMDB (Configuration Management Database)
- Extensible CI classes with parent/child inheritance (child classes inherit parent attributes)
- Class-specific attributes (string, integer, number, boolean)
- CI creation wizard with dynamic attribute forms
- Relationship management (depends_on, used_by, runs_on, connected_to, part_of, manages)
- Recursive impact analysis (blast radius)
- Full audit trail with relationship change history
- Supported By group field for support ownership
- Record navigation (prev/next) on CI detail pages

### Administration
- **User Management** — Create, edit, delete users with record navigation; auto-calculated display names (Lastname, Firstname (ID))
- **Organization** — Departments, Cost Centers, Assignment Groups
- **Service Catalog** — Services, Catalog Items with custom fields, Catalog Tasks
- **Process & Automation** — Processes, Workflows (Temporal), SLA Configuration
- **CMDB** — CI Classes with attribute builder and inheritance
- **Data & Integration** — Data Sources (REST/CSV/DB with scheduled imports via Temporal), Import History
- **System** — Roles, Theming (colors, logo, app name)
- Organized sub-menu navigation with auto-expand

### Data Tables
- Drag-and-drop column reordering
- Per-column "starts with" filter fields
- Column visibility picker
- Persistent user preferences (columns, sort order) via localStorage
- Server-side pagination for large datasets

### Security & Identity
- Multi-tenant architecture with PostgreSQL Row-Level Security
- JWT-based authentication
- SSO via OpenID Connect providers (Google-first) with auto-provisioning
- Role-based access control (admin, fulfiller, user, configuration_manager)

## Tech Stack

| Layer          | Technology                              |
|----------------|-----------------------------------------|
| Frontend       | React 18 + TypeScript + Tailwind CSS    |
| Backend        | Node.js 24+ / Express / TypeScript      |
| Validation     | Zod                                     |
| Database       | PostgreSQL 18 with Row-Level Security   |
| Auth           | JWT + OpenID Connect (Google-ready)     |
| Workflows      | Temporal                                |
| Web Server     | Caddy (reverse proxy, auto-TLS)         |
| Orchestration  | Docker Compose                          |

## Quick Start

```bash
# 1. Clone and configure
git clone <your-repo-url> nova-suite
cd nova-suite
cp .env.example .env
# Edit .env — change POSTGRES_PASSWORD and JWT_SECRET

# 2. Start everything
docker compose up -d

# 3. Wait ~30 seconds for initialization, then verify
curl http://localhost:4000/health

# 4. Access
# Web UI:        http://localhost (port 80)
# API Docs:      http://localhost/docs
# Temporal UI:   http://localhost:8080
```

**Default credentials:**

| Role                   | Email                    | Password   |
|------------------------|--------------------------|------------|
| Admin                  | `admin@acme.local`       | `admin123` |
| Fulfiller              | `fulfiller@acme.local`   | `admin123` |
| User (Employee)        | `user@acme.local`        | `admin123` |

### Core environment variables

Core env configuration is documented in `docs/ENVIRONMENT.md`.
Use `.env.example` as the baseline and keep deployment manifests aligned with that file.

### Optional Google OIDC setup

Set these values in `.env` and restart `nova-engine`:

```bash
OIDC_ISSUER=https://accounts.google.com
OIDC_CLIENT_ID=<google-oauth-client-id>
OIDC_CLIENT_SECRET=<google-oauth-client-secret>
OIDC_REDIRECT_URI=http://localhost/api/auth/sso/callback
OIDC_PROVIDER_NAME=Google
OIDC_SCOPE=openid email profile
```

Google OAuth redirect URI must exactly match `OIDC_REDIRECT_URI`.

### SSO-only mode (disable local password login)

Set this in `.env`:

```bash
AUTH_LOCAL_LOGIN_ENABLED=false
```

When disabled:
- Login page hides local email/password form and demo credentials
- `POST /api/auth/login` is blocked
- SSO remains available via `/api/auth/sso/authorize`

### Optional Microsoft Entra ID OIDC setup

Set these values in `.env` and restart `nova-engine`:

```bash
# Use your tenant ID (GUID) or "common" for multi-tenant apps
OIDC_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0
OIDC_CLIENT_ID=<entra-app-client-id>
OIDC_CLIENT_SECRET=<entra-app-client-secret>
OIDC_REDIRECT_URI=http://localhost/api/auth/sso/callback
OIDC_PROVIDER_NAME=Microsoft Entra ID
OIDC_SCOPE=openid profile email
```

In Entra app registration, add a Web redirect URI that exactly matches `OIDC_REDIRECT_URI`.

## Services

| Service        | Port  | Description                          |
|----------------|-------|--------------------------------------|
| Caddy          | 80    | Reverse proxy — main entry point     |
| Nova Web       | 3000  | React SPA (served via Caddy)         |
| Nova Engine    | 4000  | Backend REST API                     |
| PostgreSQL     | 5432  | Database                             |
| Temporal       | 7233  | Workflow engine (gRPC)               |
| Temporal UI    | 8080  | Workflow monitoring dashboard         |

## Project Structure

```
nova-suite/
├── packages/
│   ├── nova-engine/              # Backend API
│   │   └── src/
│   │       ├── index.ts          # Entry point + Swagger UI
│   │       ├── config.ts         # Environment config
│   │       ├── openapi.ts        # OpenAPI 3.0 spec
│   │       ├── api/
│   │       │   ├── routes.ts     # Main router
│   │       │   ├── auth/         # Login, SSO, register, user info
│   │       │   ├── admin/        # User/role/org management
│   │       │   ├── catalog/      # Service categories & items
│   │       │   ├── requests/     # Service request lifecycle
│   │       │   ├── incidents/    # Incident management
│   │       │   ├── cmdb/         # CI classes, items, relationships
│   │       │   └── temporal/     # Workflow orchestration
│   │       ├── data/
│   │       │   └── db.ts         # Database wrapper + RLS helpers
│   │       ├── domain/
│   │       │   └── schemas.ts    # Zod validation schemas
│   │       └── middleware/
│   │           ├── auth.ts       # JWT + RLS context
│   │           ├── errorHandler.ts
│   │           └── validate.ts   # Request validation
│   ├── nova-web/                 # Frontend SPA
│   │   └── src/
│   │       ├── api/client.ts     # API client + TypeScript interfaces
│   │       ├── components/       # DataTable, Layout, SearchBar, etc.
│   │       ├── hooks/            # useListParams, useAuth
│   │       ├── pages/
│   │       │   ├── Dashboard.tsx
│   │       │   ├── catalog/      # Service catalog + cart
│   │       │   ├── requests/     # Request list + detail
│   │       │   ├── incidents/    # Incident list + detail + create
│   │       │   ├── cmdb/         # CMDB list + detail + form
│   │       │   └── admin/        # All admin pages
│   │       └── context/          # Auth context
│   └── nova-worker/              # Temporal workflow worker
├── infra/
│   ├── postgres/
│   │   ├── init.sql              # Full schema + seed data
│   │   ├── rls.sql               # Row-Level Security policies
│   │   └── 03-demo-data.sql      # Demo data
│   └── caddy/
│       └── Caddyfile             # Reverse proxy config
├── docs/
│   ├── ARCHITECTURE.md
│   ├── HIGH_AVAILABILITY.md
│   └── UPGRADE_STRATEGY.md
├── docker-compose.yml
├── .env.example
└── package.json
```

## API Overview

All endpoints are prefixed with `/api`. Full interactive documentation is available at `/docs` (Swagger UI).

| Endpoint                            | Method | Auth           | Description                         |
|-------------------------------------|--------|----------------|-------------------------------------|
| `/api/auth/login`                   | POST   | None           | Get JWT token                       |
| `/api/auth/sso/authorize`          | GET    | None           | Initiate SSO login via OIDC         |
| `/api/auth/me`                      | GET    | Any            | Current user info                   |
| `/api/auth/users`                   | GET    | Fulfiller+     | List users (for pickers)            |
| `/api/catalog/categories`           | GET    | Any            | List service categories             |
| `/api/catalog/items`                | GET    | Any            | List service items                  |
| `/api/requests`                     | GET/POST | Any          | List / submit service requests      |
| `/api/requests/:id/approve`         | POST   | Manager/Admin  | Approve or reject a request         |
| `/api/incidents`                    | GET/POST | Fulfiller+   | List / create incidents             |
| `/api/incidents/:id`                | PATCH  | Fulfiller+     | Update an incident                  |
| `/api/incidents/:id/journal`        | GET/POST | Varies       | Activity log entries                |
| `/api/cmdb/classes`                 | GET/POST | Admin/CM     | List / create CI classes            |
| `/api/cmdb/classes/:id`            | PUT/DELETE | Admin/CM   | Update / delete CI classes          |
| `/api/cmdb/items`                   | GET/POST | Varies       | List / create configuration items   |
| `/api/cmdb/items/:id`              | GET/PATCH | Varies      | CI details / update                 |
| `/api/cmdb/items/:id/history`      | GET    | Fulfiller+     | CI audit trail                      |
| `/api/cmdb/items/:id/impact`       | GET    | Fulfiller+     | Impact analysis (blast radius)      |
| `/api/cmdb/relationships`           | GET/POST | Fulfiller+  | List / create CI relationships      |
| `/api/cmdb/relationships/:id`      | DELETE | Fulfiller+     | Remove a relationship               |
| `/api/admin/users`                  | GET/POST | Admin        | User management                     |
| `/api/admin/users/:id`             | PATCH/DELETE | Admin     | Update / delete user                |
| `/api/admin/roles`                  | GET/POST | Admin        | Role management                     |
| `/api/admin/departments`            | GET/POST | Admin        | Department management               |
| `/api/admin/cost-centers`           | GET/POST | Admin        | Cost center management              |
| `/api/admin/assignment-groups`      | GET/POST | Admin        | Assignment group management         |
| `/api/admin/services`               | GET/POST | Admin        | Service management                  |
| `/api/admin/processes`              | GET/POST | Admin        | Process management                  |
| `/api/settings/theme`              | GET/PUT | Admin         | Theming (colors, logo, name)        |

**Roles:** Admin = full access, Fulfiller (FF) = incident/request management, Configuration Manager (CM) = CMDB editing, User = self-service only.

## Documentation

- [QUICKSTART.md](QUICKSTART.md) — 5-minute setup guide
- [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) — Feature summary
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — System design & decisions
- [docs/HIGH_AVAILABILITY.md](docs/HIGH_AVAILABILITY.md) — HA deployment
- [docs/UPGRADE_STRATEGY.md](docs/UPGRADE_STRATEGY.md) — Zero-downtime upgrades
- [docs/CATALOG_TASK_AUTOMATION.md](docs/CATALOG_TASK_AUTOMATION.md) — Catalog task HTTP automation (`automation_config`)

## Development

```bash
cd packages/nova-engine
npm install
npm run dev          # Watch mode with hot reload
npm run build        # Compile TypeScript
npm test             # Run tests
npm run typecheck    # Type check without emitting
```

```bash
cd packages/nova-web
npm install
npm run dev          # Vite dev server with HMR
npm run build        # Production build
```

## License

**AGPL-3.0** — You must open-source modifications if running as a service. See [LICENSE](LICENSE) for details.
