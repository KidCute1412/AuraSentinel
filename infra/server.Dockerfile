# syntax=docker/dockerfile:1
# One image for the three server roles (compose picks the command): migrate, api, worker.
# Build context: repo root.  docker build -f infra/server.Dockerfile .

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
# Manifests first so the dependency layer is cached across source edits.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --frozen-lockfile --filter "server..."
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN pnpm --filter @agentshield/shared build \
 && pnpm --filter server build \
 && pnpm --filter server deploy --prod --legacy /out \
 && cp -r apps/server/dist /out/dist \
 && mkdir -p /out/migrations && cp -r apps/server/src/core/database/migrations/. /out/migrations/

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    MIGRATIONS_DIR=/app/migrations
WORKDIR /app
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/package.json ./package.json
COPY --from=build --chown=node:node /out/dist ./dist
COPY --from=build --chown=node:node /out/migrations ./migrations
USER node
EXPOSE 4000
CMD ["node", "dist/main.api.js"]
