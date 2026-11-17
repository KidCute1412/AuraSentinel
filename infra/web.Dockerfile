# syntax=docker/dockerfile:1
# Static SPA behind nginx, which also proxies /api (REST + SSE) to the api service: one origin, no CORS.
# Build context: repo root.  docker build -f infra/web.Dockerfile .

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/contracts/package.json packages/contracts/
COPY scripts/package.json scripts/
RUN pnpm install --frozen-lockfile --filter "web..."
COPY packages/shared packages/shared
COPY apps/web apps/web
# Public values only: they end up in the browser bundle. Never a key.
# live: real wallet sign-in and chain data through the api service. Without it the build would fall back to the
# in-browser simulation (mock), which must never be what production serves.
ARG VITE_DATA_SOURCE=live
ARG VITE_DEMO_SAFE=
ARG VITE_API_URL=/api
ARG VITE_FUJI_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
ARG VITE_WALLETCONNECT_PROJECT_ID=
ENV VITE_DATA_SOURCE=$VITE_DATA_SOURCE \
    VITE_DEMO_SAFE=$VITE_DEMO_SAFE \
    VITE_API_URL=$VITE_API_URL \
    VITE_FUJI_RPC_URL=$VITE_FUJI_RPC_URL \
    VITE_WALLETCONNECT_PROJECT_ID=$VITE_WALLETCONNECT_PROJECT_ID
RUN pnpm --filter @agentshield/shared build && pnpm --filter web build

FROM nginx:1.27-alpine
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
COPY infra/nginx-security.conf /etc/nginx/snippets/security.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
