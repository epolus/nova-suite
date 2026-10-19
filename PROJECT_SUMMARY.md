# Nova Suite — Project Summary

## Vision

Nova Suite is a production-ready, open-source ITSM Suite for internal IT, managed service providers, and small enterprises. Schema version is `v00.01.19`.

## Implemented Modules

- **Service Catalog & Requests**: Dynamic request forms, approval and fulfillment workflows, request task queues, automation builder, and cart/checkout flows.
- **Incident Management**: Full lifecycle, assignment and group routing, response and resolution SLA clocks with pause/resume, journal and work notes, known-error suggestions, bulk actions, and dashboard insights.
- **Major Incident Management**: Promote and accept, war room with commander, comms lead, scribe, and resolver roles, process progress, stakeholder cadence, and postmortem action items that can open a problem, a change, or an improvement.
- **Change Enablement**: Standard, normal, and emergency changes, risk questionnaire, CAB, schedule and dependency conflict checks with an emergency override, blackout windows, and a structured post-implementation review.
- **Problem Management**: Problem records, linked incidents, a daily recurrence scan, known-error control (symptoms and workaround to enter, permanent fix or a linked change to close), and task tracking.
- **Knowledge Management**: Article authoring, versioning, review, and publishing, approval workflows, ratings, suggestions, and markdown with attachments.
- **CMDB**: CI classes, relationship mapping, impact traversal, relationship graph, audit history, and Microsoft Intune discovery. A full sync retires Intune devices missing from a non-empty feed.
- **IT Asset Management**: Asset records linked to configuration items, lifecycle through received, in stock, in use, maintenance, retired, and disposed, plus purchase cost, warranty, contract reference, and depreciation.
- **Continual Improvement**: A register of improvements created by hand, from a postmortem action item, from an unsuccessful change, or from a problem’s permanent fix, with an activity journal of comments, work notes, and status or owner changes.
- **Service Level Management**: SLA definitions, business calendars, warning and breach actions on a bound definition, and an attainment report with pause-adjusted MTTR.
- **Reports**: Saved reports and an SLA attainment card on the reports library.
- **Notifications**: In-app, email, and outgoing Slack and Teams webhooks.
- **AI Assist**: Optional agent and employee copilots, plus create-time triage suggestions. Priority auto-apply stays off unless enabled.
- **Admin Platform**: Users, roles, groups, departments, cost centers, locations, companies, services, branding, workflows, credentials, config packages, and data-source imports.

## Core Modules

### 1. User Portal (Self-Service)
- Browse a service catalog organized by categories
- Submit requests with dynamic forms (JSON schema-based)
- Automatic routing through approval workflows
- Track request status in real time
- Optional AI assistant for catalog search, knowledge lookup, and draft incidents

### 2. Fulfiller Backend (IT Staff)
- Incident lifecycle: new → assigned → in progress → pending → resolved → closed
- Priority from the impact × urgency matrix
- Response and resolution SLA clocks, pause and resume, and breach detection
- Assignment and routing to individuals or groups
- Activity journal with customer-visible notes and internal work notes
- Known errors suggested from the same CI or service

### 3. Configuration Management Database (CMDB)
- Define infrastructure types through extensible CI classes
- Map relationships (depends_on, runs_on, connected_to, and others)
- Recursive impact analysis for the blast radius of a change
- Audit trail for compliance and change tracking
- Custom attributes via JSON
- Intune discovery into configuration items and assets, with retire-missing on full sync

### 4. IT Asset Management
- Hardware, software, license, and consumable records
- Lifecycle from ordered and received through disposal
- Purchase, warranty, and contract reference on the asset form, using the user’s date format
- Optional link to a configuration item

## Architecture Highlights

- **Multi-Tenant**: PostgreSQL Row-Level Security isolates tenant data
- **No ORM**: Direct SQL, compatible with RLS
- **Stateless Auth**: JWT, with optional OpenID Connect
- **Validation First**: Zod schemas on API input
- **Workflows**: Temporal for fulfillment, escalation, notifications, major incidents, and the problem recurrence scan
- **Structured Logging**: Pino

## Security

- Row-Level Security for tenant isolation
- Parameterized queries
- bcrypt password hashing
- JWT expiration
- Zod input validation
- Helmet security headers
- CORS configuration

## What's Next

- Operational level agreements on assignment groups
- Two-way Slack and Teams conversations, beyond outgoing webhooks
- Event management and automated root-cause analysis, once a real alert source exists
- Jamf discovery, after it uses the same connector pattern as Intune
- Supplier contracts, software entitlements, and release environments
