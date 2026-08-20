# ─── Nova Proxy – edge reverse proxy with the Nova routing table baked in ───
# Published so deployments can pull the stack without cloning the repository.
# Override /etc/caddy/Caddyfile to customize routing or add a domain for auto-TLS.
FROM caddy:2-alpine

COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile

EXPOSE 80 443
