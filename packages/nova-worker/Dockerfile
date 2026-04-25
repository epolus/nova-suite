# ─── Nova Worker – Multi-stage Docker Build ───
# Uses node:24-slim (Debian) because @temporalio/worker requires glibc
FROM node:24-slim AS base
WORKDIR /app

# ─── Dependencies ───
FROM base AS deps
COPY packages/nova-worker/package.json ./
RUN npm install --production=false

# ─── Build ───
FROM deps AS build
COPY packages/nova-worker/tsconfig.json ./
COPY packages/nova-worker/src ./src
RUN npx tsc

# ─── Production ───
FROM base AS production
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY packages/nova-worker/package.json ./

RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -s /bin/sh nova
USER nova

CMD ["node", "dist/worker.js"]
