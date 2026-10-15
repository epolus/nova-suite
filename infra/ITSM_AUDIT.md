# ITSM Platform Feature Audit & Strategy Benchmark

> **Context for Cursor:**
> This document defines the technical architectural baseline and functional scope for Nova Suite.
> When analyzing the codebase, use this file to evaluate gaps in schema models, API endpoints, workflow coverage, and UI features against ITIL 4 standards and competitive market practices.
>
> **Schema source of truth:** `infra/postgres/init.sql` + `infra/postgres/migrations/` + `infra/postgres/rls.sql` (no ORM).

---

## 1. System Context & Tech Stack

- **Platform Name:** Nova Suite
- **Target Persona:** Internal IT Teams, Managed Service Providers (MSPs), Small Enterprise
- **Core Stack:**
  - **Frontend:** Vite / React / React Router / Tailwind (`packages/nova-web`)
  - **Backend / API:** Node.js / Express / Zod (`packages/nova-engine`)
  - **Database:** PostgreSQL with Row-Level Security (direct SQL; no Prisma/ORM)
  - **Shared:** `@nova-suite/shared` (automation helpers, shared types)
  - **Authentication:** JWT with OIDC/SSO support
  - **Background Jobs/Events:** Temporal (`packages/nova-worker`)

---

## 2. Active Feature Index

*Update this section on the same branch that implements a feature.*

| Module / Practice | Implemented Features | Associated Code / Schemas | Status |
| :--- | :--- | :--- | :--- |
| **Incident Management** | CRUD, impact×urgency priority matrix, assignment, journal, SLA due/breach fields, escalate workflow | `infra/postgres/init.sql` (`incidents`, `priority_matrix`), `packages/nova-engine/src/api/incidents/`, `packages/nova-worker/src/workflows/incident-escalation.ts`, `packages/nova-web/src/pages/incidents/` | In Progress |
| **Major Incident Management** | Declare/promote, war room, participants, stakeholder cadence, postmortem | `packages/nova-engine/src/api/major-incidents/`, `packages/nova-worker/src/workflows/major-incident.ts`, `packages/nova-web/src/pages/major-incidents/` | MVP Ready |
| **Service Request Management** | Catalog, dynamic forms, cart, approvals, fulfillment tasks, automation | `packages/nova-engine/src/api/catalog/`, `packages/nova-engine/src/api/requests/`, `packages/nova-web/src/pages/catalog/`, `packages/nova-web/src/pages/requests/` | MVP Ready |
| **Change Enablement** | Standard/Normal/Emergency types, CAB meetings/approvals, schedule + same-CI conflicts, blackouts | `packages/nova-engine/src/api/changes/`, `packages/nova-web/src/pages/changes/`, `packages/nova-web/src/pages/admin/ChangeAdminPage.tsx` | MVP Ready |
| **Problem Management** | Problem CRUD, RCA fields, incident linking, KEDB CRUD + KB article link, recurrence→problem, problem tasks | `packages/nova-engine/src/api/problems/`, `packages/nova-web/src/pages/problems/`, `known_errors` (+ `kb_article_id`) in `init.sql` / migrations | MVP Ready |
| **IT Asset Management (ITAM)** | Hardware/software inventory, asset↔CI link, statuses (in_use/in_stock/retired/disposed) | `packages/nova-engine/src/api/assets/`, `packages/nova-web/src/pages/assets/` | In Progress |
| **CMDB** | CI classes, relationships, impact analysis, history, external IDs, data-source ingest | `packages/nova-engine/src/api/cmdb/`, `packages/nova-web/src/pages/cmdb/`, `cmdb_impact_analysis()` | MVP Ready |
| **Service Level Management** | SLA definitions (response + resolution hours stored), resolution due-at runtime, warning_pct / breach flags | `packages/nova-engine/src/domain/sla.ts`, `packages/nova-web/src/pages/admin/sla/`, `sla_definitions` | In Progress |
| **Knowledge Base** | Articles, categories, versioning, approvals, ratings, incident→KB resolutions | `packages/nova-engine/src/api/knowledge/`, `packages/nova-web/src/pages/knowledge/` | MVP Ready |
| **Notifications** | In-app + email channels, rule admin UI | `packages/nova-engine/src/api/notifications/`, `packages/nova-web/src/pages/admin/notifications/` | In Progress |
| **AI Assist** | Agent + ESS copilots with KB/catalog tools | `packages/nova-engine/src/ai/`, `packages/nova-engine/src/api/ai/` | In Progress |

---

## 3. Standard Audit Benchmarks (ITIL v4 Framework)

*Use this checklist when prompting the LLM to inspect missing database relations, logic, or endpoints.*

### A. Incident Management
- [x] Basic ticket creation, assignment, and status lifecycle.
- [x] Automated incident prioritization matrix (Urgency x Impact).
- [ ] Escalation paths and automated re-routing. *(partial: Temporal escalation + shallow auto-assign; real channel notify pending)*
- [x] Major Incident Management (MIM) workflow & incident command mode.

### B. Change Enablement
- [x] Standard, Normal, and Emergency Change categorization.
- [x] Change Advisory Board (CAB) review & approval workflows.
- [ ] Risk assessment questionnaire and scoring. *(partial: risk_level enum + free-text assessment; no scored questionnaire)*
- [ ] Collision detection (preventing simultaneous changes on connected assets). *(partial: schedule/blackout/same-CI; no dependency-tree walk)*

### C. Problem Management
- [x] Problem log creation from recurring incidents. *(GET recurrence-candidates + POST from-recurring-incidents; UI on Problems list)*
- [x] Root Cause Analysis (RCA) documentation tab.
- [x] Known Error Database (KEDB) linking to KB articles. *(`known_errors.kb_article_id` + link/unlink API + Known Errors tab)*

### D. IT Asset Management (ITAM) & CMDB
- [ ] Asset lifecycle state tracking (Ordered -> In Use -> Maintenance -> Retired). *(partial: in_use/in_stock/retired/disposed; CI has maintenance)*
- [x] CI (Configuration Item) relationship mapping (Dependency tree).
- [ ] Agentless network discovery / API integrations (e.g., Jamf, Intune). *(partial: generic data-source/import only)*

### E. Service Level Management (SLA)
- [ ] Multi-tier SLAs (Response Time vs. Resolution Time). *(partial: both hours stored; runtime uses resolution only)*
- [ ] Business hours / holiday calendar time-tracking logic.
- [ ] Pause triggers (e.g., waiting on user response pauses SLA clock).
- [ ] Breach warnings and automated escalation notifications. *(partial: Temporal warning/breach + journal stubs; no Slack/Teams)*

---

## 4. Competitive Differentiator Wishlist (AI & Automation)

- [ ] **AI Ticket Triaging:** Natural language auto-tagging, sentiment detection, and SLA prediction. *(partial: agent/ESS copilots exist; no create-time auto-triage)*
- [ ] **AI Agent Deflection:** Self-service bot auto-answering tickets using Knowledge Base context. *(partial: ESS proposes create/search; no autonomous deflect/close)*
- [ ] **Automated RCA:** AI correlation of recent system alerts/deployments to open incidents.
- [ ] **Modern Webhooks/Integrations:** Native Slack/Microsoft Teams bi-directional ticket management.

---

## 5. Instructions for LLM Prompts & Audits

When conducting a code review or feature gap assessment, run the following workflows:

1. **Schema Check:** Inspect `infra/postgres/init.sql`, `infra/postgres/migrations/`, and `infra/postgres/rls.sql`. Highlight missing fields, foreign keys, indexes, or RLS policies. Zod mirrors live in `packages/nova-engine/src/domain/schemas.ts`.
2. **API Endpoint Audit:** Scrape route handlers under `packages/nova-engine/src/api/` and compare against expected CRUD / state-transition operations. Web clients live in `packages/nova-web/src/api/domains/`.
3. **Workflow Integrity Audit:** Trace state transitions in engine routes and Temporal workflows under `packages/nova-worker/src/workflows/`.
4. **UI Coverage:** Confirm pages under `packages/nova-web/src/pages/` expose the lifecycle actions the API supports.
5. **Keep this file honest:** When a gap is closed, update Section 2 status and Section 3/4 checkboxes on the **same** feature branch.
