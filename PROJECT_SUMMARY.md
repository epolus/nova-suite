# Nova Suite — Project Summary

## Vision

Nova Suite is a production-ready, open-source ITSM Suite.


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

- Frontend UI (Backstage.io or custom React)
- Email notifications
- SLA compliance dashboards
- Knowledge base
- Change management module
- Problem management module
