# ─── Nova Worker – Multi-stage Docker Build ───
# Uses node:24-slim (Debian) because @temporalio/worker requires glibc
FROM node:24-slim AS base
WORKDIR /app

# ─── Dependencies ───
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/nova-worker/package.json packages/nova-worker/package.json
COPY packages/nova-shared/package.json packages/nova-shared/package.json
RUN npm install --workspaces --include-workspace-root=false

# ─── Build ───
FROM deps AS build
COPY packages/nova-shared/tsconfig.json packages/nova-shared/tsconfig.json
COPY packages/nova-shared/tsconfig.esm.json packages/nova-shared/tsconfig.esm.json
COPY packages/nova-shared/tsconfig.cjs.json packages/nova-shared/tsconfig.cjs.json
COPY packages/nova-shared/src packages/nova-shared/src
COPY packages/nova-worker/tsconfig.json packages/nova-worker/tsconfig.json
COPY packages/nova-worker/src packages/nova-worker/src
RUN npm run -w packages/nova-shared build && npm run -w packages/nova-worker build

# ─── Production ───
FROM base AS production
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app /app
COPY --from=build /app/packages/nova-worker/dist /app/packages/nova-worker/dist
COPY --from=build /app/packages/nova-worker/package.json /app/packages/nova-worker/package.json
COPY --from=build /app/packages/nova-shared /app/packages/nova-shared

RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -s /bin/sh nova
USER nova

CMD ["node", "packages/nova-worker/dist/worker.js"]
