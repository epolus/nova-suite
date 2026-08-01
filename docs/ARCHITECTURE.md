# Nova Suite — Architecture

## Overview

Nova Suite follows a monolithic-but-modular architecture. A single Express server exposes all API endpoints, backed by PostgreSQL for persistence and Temporal for long-running workflows. The modular route structure makes it straightforward to extract services later if needed.

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│   Caddy     │────▶│ Nova Engine │────▶│ PostgreSQL   │
│ (reverse    │     │ (Express +  │     │(RLS enabled) │
│  proxy)     │     │  TypeScript)│     └──────────────┘
└─────────────┘     │             │
                    │             │────▶┌──────────────┐
                    └─────────────┘     │  Temporal    │
                                        │ (workflows)  │
                                        └──────────────┘
```

## Multi-Tenancy Strategy

### Row-Level Security (RLS)

Every tenant-scoped table has RLS policies enabled and forced. The application sets session-level GUC variables at the start of each request:

```sql
SELECT set_tenant_context(tenant_id, user_id, user_role);
```

After this call, all subsequent queries in that connection are automatically filtered by tenant. This provides defense-in-depth — even if application code has a bug, the database prevents cross-tenant data access.

### RLS Policy Examples

```sql
-- Users see only their own requests; fulfillers and admins see all
CREATE POLICY tenant_isolation_requests ON requests
  FOR ALL USING (
    tenant_id = current_tenant_id()
    AND (
      current_user_role() IN ('admin', 'fulfiller')
      OR requester_id = current_user_id()
    )
  );
```

### Why Not Schema-Per-Tenant?

- RLS is simpler to manage (one schema, one migration path)
- Better resource utilization (shared connection pool)
- Scales to thousands of tenants without operational overhead
- PostgreSQL RLS is battle-tested and performant

## Database Design

### No ORM — Why?

1. **Performance**: Direct control over every query
2. **Transparency**: See exactly what SQL runs (critical for debugging)
3. **RLS Compatibility**: ORMs don't handle session-level RLS well
4. **Simplicity**: One less abstraction layer to debug

### Key Tables

| Table                  | Purpose                                    |
|------------------------|--------------------------------------------|
| `tenants`              | Tenant organizations                       |
| `users`                | Authenticated users with roles             |
| `service_categories`   | Catalog organization                       |
| `service_items`        | Requestable services with dynamic forms    |
| `requests`             | User submissions through the portal        |
| `incidents`            | Fulfiller work items with SLA tracking     |
| `incident_journal`     | Activity log (comments, state changes)     |
| `ci_classes`           | Extensible CI type definitions             |
| `configuration_items`  | Actual infrastructure items                |
| `ci_relationships`     | Dependency graph between CIs               |
| `ci_history`           | Audit trail for CI changes                 |
| `priority_matrix`      | Impact × Urgency → Priority mapping        |

### Indexes

Every table has:
- Primary key index (automatic)
- Tenant ID index (for RLS filter performance)
- Business-specific indexes (status, assignment, SLA due dates)

## Authentication & Authorization

### JWT Flow

1. User sends `POST /api/auth/login` with email + password
2. Server verifies against bcrypt hash
3. Server returns JWT containing `{id, tenant_id, email, display_name, role}`
4. Client sends JWT in `Authorization: Bearer <token>` header
5. Middleware verifies JWT, attaches user to request
6. RLS middleware sets tenant context on the database connection

### OIDC Provider Config

SSO provider behavior is env-driven in the same Express runtime:

- `OIDC_ISSUER`
- `OIDC_CLIENT_ID`
- `OIDC_CLIENT_SECRET`
- `OIDC_REDIRECT_URI`
- `OIDC_PROVIDER_NAME`
- `OIDC_SCOPE`

This supports Google and Microsoft Entra ID without code-path changes.

### Role Hierarchy

| Role      | Capabilities                                            |
|-----------|---------------------------------------------------------|
| `admin`   | Everything: user management, catalog admin, CMDB, all   |
| `fulfiller`| Incidents, CMDB, request approval, journal entries     |
| `user`    | Browse catalog, submit requests, view own requests      |

## API Design Principles

1. **RESTful**: Standard HTTP methods and status codes
2. **Consistent Errors**: All errors return `{error, code, details?}`
3. **Validation First**: Zod schemas validate every input before processing
4. **Pagination**: All list endpoints support `?page=1&limit=20`
5. **Filtering**: Query parameters for common filters (status, assignment, etc.)
6. **OpenAPI**: Full Swagger documentation at `/docs`

## Error Handling

```
Request → Zod Validation → Business Logic → Database
            ↓                    ↓              ↓
         400 + details      AppError(4xx)   500 (logged)
```

All errors flow through the global error handler which:
- Converts Zod errors to structured 400 responses
- Passes through AppError instances with their status codes
- Catches unknown errors, logs them, returns generic 500

## CMDB Architecture

### Extensible CI Classes

CI classes define the schema for configuration items:

```json
{
  "name": "database_server",
  "attributes": {
    "engine": {"type": "string"},
    "version": {"type": "string"},
    "max_connections": {"type": "integer"}
  }
}
```

Configuration items store their class-specific data in a JSONB `attributes` column, validated against the class schema.

### Relationship Graph

CI relationships form a directed graph. The `cmdb_impact_analysis` function performs recursive traversal to compute blast radius:

```
                    ┌──────────┐
                    │ Firewall │
                    └────▲─────┘
                         │ connected_to
            ┌────────────┼────────────┐
            │                         │
      ┌─────┴──────┐           ┌──────┴─────┐
      │ Web Srv 1  │           │ Web Srv 2  │
      └─────▲──────┘           └──────▲─────┘
            │ runs_on                 │ runs_on
            └────────────┬────-───────┘
                   ┌─────┴─────┐
                   │ Nova API  │──depends_on──▶ PostgreSQL
                   └───────────┘
```

Querying impact analysis on PostgreSQL returns: Nova API, Web Srv 1, Web Srv 2 — everything that would be affected.

## Deployment Architecture

See [HIGH_AVAILABILITY.md](HIGH_AVAILABILITY.md) for production deployment patterns including Docker Swarm and Kubernetes configurations.
