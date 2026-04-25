FROM node:24-alpine AS build
WORKDIR /app
COPY packages/nova-web/package.json ./
RUN npm install
COPY packages/nova-web/ ./
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /app/dist /srv
COPY packages/nova-web/Caddyfile /etc/caddy/Caddyfile
EXPOSE 3000
