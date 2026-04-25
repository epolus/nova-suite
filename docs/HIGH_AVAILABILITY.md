# Nova Suite — High Availability Deployment

## Overview

This guide covers two HA deployment strategies:
1. **Docker Swarm** — Simple HA for small teams (recommended starting point)
2. **Kubernetes** — Enterprise-grade HA for larger deployments

## Core Environment Variables

Use `docs/ENVIRONMENT.md` as the source of truth for core env values and behavior notes.
Keep your Swarm/Kubernetes manifests aligned with `.env.example`.

## Docker Swarm Deployment

### Prerequisites
- 3+ nodes (1 manager, 2+ workers)
- Docker Engine with Swarm mode enabled
- Shared storage for PostgreSQL (NFS or cloud volume)

### Initialize Swarm

```bash
# On the manager node
docker swarm init --advertise-addr <manager-ip>

# On worker nodes (use the token from init output)
docker swarm join --token <token> <manager-ip>:2377
```

### Deploy Stack

```yaml
# docker-stack.yml
version: "3.9"

services:
  postgres:
    image: postgres:18-alpine
    deploy:
      replicas: 1
      placement:
        constraints: [node.role == manager]
      restart_policy:
        condition: on-failure
        delay: 5s
    environment:
      POSTGRES_DB: nova
      POSTGRES_USER: nova_app
      POSTGRES_PASSWORD_FILE: /run/secrets/pg_password
    volumes:
      - pg_data:/var/lib/postgresql/data
    secrets:
      - pg_password

  nova-engine:
    image: nova-suite/engine:latest
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 30s
        failure_action: rollback
      restart_policy:
        condition: on-failure
    environment:
      POSTGRES_HOST: postgres
      JWT_SECRET_FILE: /run/secrets/jwt_secret
    secrets:
      - jwt_secret

  caddy:
    image: caddy:2-alpine
    deploy:
      replicas: 2
      placement:
        max_replicas_per_node: 1
    ports:
      - "80:80"
      - "443:443"

secrets:
  pg_password:
    external: true
  jwt_secret:
    external: true

volumes:
  pg_data:
    driver: local
```

```bash
# Create secrets
echo "your-strong-password" | docker secret create pg_password -
echo "your-jwt-secret-32chars" | docker secret create jwt_secret -

# Deploy
docker stack deploy -c docker-stack.yml nova
```

### Scaling

```bash
# Scale API servers
docker service scale nova_nova-engine=5

# Check status
docker service ls
docker service ps nova_nova-engine
```

## Kubernetes Deployment

### Namespace and Secrets

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: nova-suite
---
apiVersion: v1
kind: Secret
metadata:
  name: nova-secrets
  namespace: nova-suite
type: Opaque
stringData:
  POSTGRES_PASSWORD: "your-strong-password"
  JWT_SECRET: "your-jwt-secret-at-least-32-chars"
```

### PostgreSQL StatefulSet

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: nova-suite
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:18-alpine
          ports:
            - containerPort: 5432
          env:
            - name: POSTGRES_DB
              value: nova
            - name: POSTGRES_USER
              value: nova_app
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: nova-secrets
                  key: POSTGRES_PASSWORD
          volumeMounts:
            - name: pg-data
              mountPath: /var/lib/postgresql/data
          readinessProbe:
            exec:
              command: ["pg_isready", "-U", "nova_app"]
            initialDelaySeconds: 5
            periodSeconds: 10
  volumeClaimTemplates:
    - metadata:
        name: pg-data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 20Gi
```

### Nova Engine Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nova-engine
  namespace: nova-suite
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 1
  selector:
    matchLabels:
      app: nova-engine
  template:
    metadata:
      labels:
        app: nova-engine
    spec:
      containers:
        - name: nova-engine
          image: nova-suite/engine:latest
          ports:
            - containerPort: 4000
          env:
            - name: POSTGRES_HOST
              value: postgres
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: nova-secrets
                  key: POSTGRES_PASSWORD
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: nova-secrets
                  key: JWT_SECRET
          readinessProbe:
            httpGet:
              path: /health
              port: 4000
            initialDelaySeconds: 10
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /health
              port: 4000
            initialDelaySeconds: 30
            periodSeconds: 10
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: nova-engine
  namespace: nova-suite
spec:
  selector:
    app: nova-engine
  ports:
    - port: 4000
      targetPort: 4000
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: nova-ingress
  namespace: nova-suite
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts:
        - nova.example.com
      secretName: nova-tls
  rules:
    - host: nova.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: nova-engine
                port:
                  number: 4000
```

### Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: nova-engine-hpa
  namespace: nova-suite
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: nova-engine
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

## Database HA

For production, replace the single PostgreSQL instance with:

1. **Managed Service**: AWS RDS, Google Cloud SQL, Azure Database for PostgreSQL
2. **Self-Managed**: Patroni + pgBouncer for automatic failover

Managed services are recommended for most teams — they handle backups, failover, and scaling automatically.

## Monitoring

Recommended stack:
- **Prometheus** — Metrics collection
- **Grafana** — Dashboards and alerting
- **Loki** — Log aggregation (pairs with pino structured logs)

Key metrics to monitor:
- API response times (p50, p95, p99)
- Database connection pool utilization
- SLA breach rate
- Active incident count by priority
- Request queue depth
