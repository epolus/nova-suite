# Nova Suite — Project Summary

## Vision

Nova Suite is a production-ready, open-source ITSM Suite.

## Implemented Modules

- **Service Catalog & Requests**: Dynamic request forms, approval/fulfillment workflows, request task queues, automation builder, and cart/checkout flows.
- **Incident Management**: Full lifecycle handling, assignment/group routing, SLA tracking, journal/work notes, bulk actions, and dashboard insights.
- **Change Management**: Change lifecycle, approvals, scheduling/conflict checks, blackout windows, CAB support, and user-format-aware date/time UX.
- **Problem Management**: Problem records, linked incidents, known errors, and task tracking.
- **Knowledge Management**: Article authoring/versioning/review/publishing, approval workflows, ratings, suggestions, and markdown + attachment support.
- **CMDB**: CI class modeling, relationship mapping, impact traversal, relationship graph UI, and audit/history support.
- **Admin Platform**: Users/roles/groups/departments/cost-centers/locations/companies/services, branding/theming, notification workflows, and data source integrations.


## Core Modules

### 1. User Portal (Self-Service)
- Browse a service catalog organized by categories
- Submit requests with dynamic forms (JSON schema-based)
- Automatic routing through approval workflows
- Track request status in real time

### 2. Fulfiller Backend (IT Staff)
- Complete incident lifecycle: new → assigned → in_progress → resolved → closed
- Automatic priority calculation via Impact × Urgency matrix
- SLA tracking with configurable due dates and breach detection
- Assignment and routing to individuals or groups
- Activity journal with customer-visible and internal work notes

### 3. Configuration Management Database (CMDB)
- Define any infrastructure type through extensible CI classes
- Map relationships between CIs (depends_on, runs_on, connected_to, etc.)
- Recursive impact analysis — understand the blast radius of any change
- Complete audit trail for compliance and change tracking
- Custom attributes via JSON for unlimited flexibility

## Architecture Highlights

- **Multi-Tenant**: PostgreSQL Row-Level Security ensures complete data isolation
- **No ORM**: Direct SQL for full control, transparency, and RLS compatibility
- **Stateless Auth**: JWT tokens for easy horizontal scaling
- **Validation First**: Zod schemas on every input, no data gets through unchecked
- **Structured Logging**: Pino for production-grade observability

## Security

- Row-Level Security for tenant isolation
- Parameterized queries (no SQL injection)
- bcrypt password hashing
- JWT token expiration
- Zod input validation
- Helmet security headers
- CORS configuration

## What's Next

- Advanced dashboard analytics and trend views
- Broader notification channels (email/teams/slack)
- Expanded workflow templates and governance controls
- Performance optimizations and frontend chunk splitting
- Additional demo packs and import/export tooling
