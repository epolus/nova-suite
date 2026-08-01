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
ARG VITE_DEFAULT_LOCALE=en
ARG VITE_SUPPORTED_LOCALES=en,de,de-ch,fr,it
ARG VITE_LOCALE_STORAGE_KEY=nova_locale
ARG VITE_LOCALE_PREFERENCE_SCOPE=ui:locale
ARG VITE_HIDE_DEMO_LOGIN_CREDENTIALS=false
ENV VITE_DEFAULT_LOCALE=$VITE_DEFAULT_LOCALE \
    VITE_SUPPORTED_LOCALES=$VITE_SUPPORTED_LOCALES \
    VITE_LOCALE_STORAGE_KEY=$VITE_LOCALE_STORAGE_KEY \
    VITE_LOCALE_PREFERENCE_SCOPE=$VITE_LOCALE_PREFERENCE_SCOPE \
    VITE_HIDE_DEMO_LOGIN_CREDENTIALS=$VITE_HIDE_DEMO_LOGIN_CREDENTIALS
RUN npm run -w packages/nova-shared build && npm run -w packages/nova-web build

FROM caddy:2-alpine
COPY --from=build /app/packages/nova-web/dist /srv
COPY packages/nova-web/Caddyfile /etc/caddy/Caddyfile
EXPOSE 3000
