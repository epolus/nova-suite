# Nova Web

**Web frontend for [Nova Suite](https://github.com/epolus/nova-suite) — an open-source IT Service Management (ITSM) platform.**

Nova Web is the React single-page application: the employee self-service portal (service catalog, cart, request tracking, approvals) and the agent and admin console (incident, change, problem and knowledge management, CMDB with relationship graphs and impact analysis, workflow designer, and platform administration). It ships as a static production build served by Caddy.

The UI is localized (English, German, Swiss German, French, Italian) and themeable at runtime — colors, logo, and application name are tenant settings fetched from the API, not build-time constants.

## Tags

| Tag | Meaning |
| --- | --- |
| `latest` | Latest commit on `main`. Moves often — pin a version for production. |
| `1.4.2` | Exact release. Immutable. |
| `1.4`, `1` | Moving tags that follow the newest patch / minor in that line. |
| `sha-<short>` | Exact commit, for traceability. |

Platform: `linux/amd64`.

## Quick start

```bash
git clone https://github.com/epolus/nova-suite
cd nova-suite
./scripts/setup.sh
docker compose up -d
```

Then open `http://localhost`.

## How it serves requests

The bundled Caddy config listens on port **3000** and does three things:

- `/api/*` → reverse proxied to `nova-engine:4000`
- `/docs*` → reverse proxied to `nova-engine:4000` (Swagger UI)
- everything else → static SPA files with an `index.html` fallback for client-side routes

**The upstream hostname `nova-engine` is baked into the image's Caddyfile.** The container must run on a network where `nova-engine` resolves to the API — for example a Docker network where the API container or service is named `nova-engine`. If your API has a different hostname, mount your own config over `/etc/caddy/Caddyfile`.

Because the API is proxied through the same origin, the browser needs no CORS configuration and no API URL at build time.

## Running the container directly

```bash
docker run -d --name nova-web \
  --network nova-net \
  -p 3000:3000 \
  epolus/nova-web:latest
```

## Configuration

This is a **static build**: the `VITE_*` values below are compiled into the JavaScript bundle at image build time. Setting them as runtime environment variables on the container has no effect. The published image uses these defaults:

| Build argument | Default | Purpose |
| --- | --- | --- |
| `VITE_DEFAULT_LOCALE` | `en` | Initial UI language. |
| `VITE_SUPPORTED_LOCALES` | `en,de,de-ch,fr,it` | Languages offered in the picker. |
| `VITE_LOCALE_STORAGE_KEY` | `nova_locale` | Browser storage key for the chosen language. |
| `VITE_LOCALE_PREFERENCE_SCOPE` | `ui:locale` | Scope key for the persisted preference. |
| `VITE_HIDE_DEMO_LOGIN_CREDENTIALS` | `false` | When `true`, hides the demo quick-login buttons on the sign-in page. **Set this to `true` for any deployment reachable by real users.** |

To change them, build from source:

```bash
docker build \
  -f packages/nova-web/Dockerfile \
  --build-arg VITE_DEFAULT_LOCALE=de \
  --build-arg VITE_HIDE_DEMO_LOGIN_CREDENTIALS=true \
  -t my-org/nova-web:custom .
```

Build from the repository root — the Dockerfile expects the whole workspace as context because the frontend depends on the shared `nova-shared` package.

## Demo credentials

The stock database seed creates demo accounts (`admin@acme.local`, `fulfiller@acme.local`, `user@acme.local`, all with password `admin123`). Remove or change them before exposing an instance, and build with `VITE_HIDE_DEMO_LOGIN_CREDENTIALS=true` so the quick-login buttons disappear.

## Related images

- [`epolus/nova-engine`](https://hub.docker.com/r/epolus/nova-engine) — backend REST API and database migrator (required)
- [`epolus/nova-worker`](https://hub.docker.com/r/epolus/nova-worker) — Temporal worker for workflows and scheduled imports

Run all three at the same version.

## Documentation and source

- Source: [github.com/epolus/nova-suite](https://github.com/epolus/nova-suite)
- [Architecture](https://github.com/epolus/nova-suite/blob/main/docs/ARCHITECTURE.md) · [Environment variables](https://github.com/epolus/nova-suite/blob/main/docs/ENVIRONMENT.md) · [High availability](https://github.com/epolus/nova-suite/blob/main/docs/HIGH_AVAILABILITY.md) · [Upgrades](https://github.com/epolus/nova-suite/blob/main/docs/UPGRADE_STRATEGY.md)
- Report issues: [github.com/epolus/nova-suite/issues](https://github.com/epolus/nova-suite/issues)

## License

[AGPL-3.0](https://github.com/epolus/nova-suite/blob/main/LICENSE). If you run a modified version as a network service, you must make your modifications available under the same license.
