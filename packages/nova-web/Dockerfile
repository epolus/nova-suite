FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/nova-web/package.json packages/nova-web/package.json
COPY packages/nova-shared/package.json packages/nova-shared/package.json
RUN npm install --workspaces --include-workspace-root=false
COPY packages/nova-shared/tsconfig.json packages/nova-shared/tsconfig.json
COPY packages/nova-shared/tsconfig.esm.json packages/nova-shared/tsconfig.esm.json
COPY packages/nova-shared/tsconfig.cjs.json packages/nova-shared/tsconfig.cjs.json
COPY packages/nova-shared/src packages/nova-shared/src
COPY packages/nova-web/ packages/nova-web/
RUN npm run -w packages/nova-shared build && npm run -w packages/nova-web build

FROM caddy:2-alpine
COPY --from=build /app/packages/nova-web/dist /srv
COPY packages/nova-web/Caddyfile /etc/caddy/Caddyfile
EXPOSE 3000
