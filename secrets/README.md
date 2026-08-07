# JWT RSA key material (gitignored `*.pem` files)

Generate keys (or use `./scripts/setup.sh` which does this automatically):

```bash
./scripts/generate-jwt-keys.sh
# Regenerate: ./scripts/generate-jwt-keys.sh --force
```

Docker Compose mounts this directory at `/secrets` for `nova-engine`.
Keys must be readable by container user `nova` (uid **1001**). The generate
script sets mode `644` for that reason.
