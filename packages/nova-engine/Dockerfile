# ─── Nova Engine – Multi-stage Docker Build ───
FROM node:24-alpine AS base
WORKDIR /app

# ─── Dependencies ───
FROM base AS deps
COPY packages/nova-engine/package.json ./
RUN npm install --production=false

# ─── Build ───
FROM deps AS build
COPY packages/nova-engine/tsconfig.json ./
COPY packages/nova-engine/src ./src
RUN npx tsc

# ─── Production ───
FROM base AS production
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY packages/nova-engine/package.json ./

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nova -u 1001 && \
    mkdir -p /data/uploads && chown nova:nodejs /data/uploads
USER nova

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -q --spider http://localhost:4000/health || exit 1

CMD ["node", "dist/index.js"]
