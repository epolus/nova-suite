# AI Assistant (ESS + Agent)

Nova Suite includes a server-side AI assistant with two personas:

| Persona | Users | Capabilities |
|---------|-------|----------------|
| **ESS** | Employee self-service (`user` role) | KB search, **service catalog** search (e.g. find “New Laptop”), draft incidents (confirm to create) |
| **Agent** | Fulfiller / admin | Incident context, KB suggestions, draft work notes, propose catalog `automation_config` |

All **writes require explicit confirmation** in the chat UI. The LLM never calls Postgres directly—only registered tools under tenant RLS.

## Enable

In `.env` (see `.env.example`):

```bash
AI_ENABLED=true
AI_DEFAULT_PROVIDER=openai   # openai | azure_openai | ollama
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

For **Ollama** (uses native `POST /api/chat`, not `/v1/chat/completions`):

```bash
AI_DEFAULT_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

Pull the model on the Ollama host first: `ollama pull llama3.2` (name must match `ollama list`).

From **Docker Compose**, point nova-engine at the Ollama container, e.g. `OLLAMA_BASE_URL=http://ollama:11434` if the service is named `ollama` on the same network. The default `host.docker.internal` only works when Ollama runs on the host.

Tool calling needs a capable model (e.g. `llama3.2`, `qwen3`). If your Ollama build exposes OpenAI `/v1` (uncommon), set `OLLAMA_USE_OPENAI_COMPAT=true`.

For **Azure OpenAI**:

```bash
AI_DEFAULT_PROVIDER=azure_openai
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_DEPLOYMENT=your-deployment
```

Restart **nova-engine** after changing AI env vars. Rebuild is not required for engine-only changes.

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/ai/status` | Feature flags (no LLM call) |
| `POST` | `/api/ai/conversations` | Start thread (`persona`, optional `context`) |
| `GET` | `/api/ai/conversations/:id` | History + pending actions |
| `POST` | `/api/ai/conversations/:id/messages` | Send message (`stream: true` for SSE) |
| `POST` | `/api/ai/conversations/:id/actions/:actionId/confirm` | Execute pending action |
| `DELETE` | `/api/ai/conversations/:id/actions/:actionId` | Dismiss pending action |

## UI

- **ESS**: floating chat button (bottom-right) on all ESS layout pages.
- **Agent**: same on fulfiller layout; incident and catalog task pages pass `incidentId` / `catalogTaskId` context automatically.
- **Catalog automation**: valid proposals offer **Apply to editor**; you still **Save** the task manually.

## Database

Fresh installs create tables in `infra/postgres/init.sql` (section **AI ASSISTANT**) with RLS in `infra/postgres/rls.sql`. Existing databases need equivalent DDL + policies applied manually or via your migration process.

## Security notes

- API keys stay on the server only.
- Per-user rate limit: `AI_RATE_LIMIT_PER_USER_PER_MIN` (default 20).
- Pending actions expire after `AI_PENDING_ACTION_TTL_MINUTES` (default 60).
- Audit entries are written to `ai_audit_log` on confirm.
