# Observability Guide

## Exposed endpoints

- `GET /health`
  - database connectivity
  - redis connectivity (or disabled)
  - temporal connectivity
  - worker heartbeat freshness
  - workflow start queue pending/failed counts
- `GET /metrics`
  - Prometheus-formatted process and HTTP metrics (`nova_engine_*`)

## Suggested alerts

- `health_status != healthy` for 2 consecutive checks
- `worker = stale` for > 2 minutes
- `workflow_start_queue_failed > 0` for > 5 minutes
- p95 `nova_engine_http_request_duration_seconds` > 1.5s for 10 minutes
- `5xx` ratio > 2% for 5 minutes

## Dashboard starter KPIs

- Request rate and latency by route
- Error rate by status code class
- Queue pending/failed trend
- Worker heartbeat age
- Redis hit ratio and operation errors
