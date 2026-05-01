# ─── Nova Engine – Multi-stage Docker Build ───
FROM node:24-alpine AS base
WORKDIR /app

# ─── Dependencies ───
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/nova-engine/package.json packages/nova-engine/package.json
COPY packages/nova-shared/package.json packages/nova-shared/package.json
RUN npm install --workspaces --include-workspace-root=false

# ─── Build ───
FROM deps AS build
COPY packages/nova-shared/tsconfig.json packages/nova-shared/tsconfig.json
COPY packages/nova-shared/tsconfig.esm.json packages/nova-shared/tsconfig.esm.json
COPY packages/nova-shared/tsconfig.cjs.json packages/nova-shared/tsconfig.cjs.json
COPY packages/nova-shared/src packages/nova-shared/src
COPY packages/nova-engine/tsconfig.json packages/nova-engine/tsconfig.json
COPY packages/nova-engine/src packages/nova-engine/src
RUN npm run -w packages/nova-shared build && npm run -w packages/nova-engine build

# ─── Production ───
FROM base AS production
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app /app
COPY --from=build /app/packages/nova-engine/dist /app/packages/nova-engine/dist
COPY --from=build /app/packages/nova-engine/package.json /app/packages/nova-engine/package.json
COPY --from=build /app/packages/nova-shared /app/packages/nova-shared

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nova -u 1001 && \
    mkdir -p /data/uploads && chown nova:nodejs /data/uploads
USER nova

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -q --spider http://localhost:4000/health || exit 1

CMD ["node", "packages/nova-engine/dist/index.js"]
