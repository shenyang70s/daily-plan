FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY infra/migrations ./infra/migrations
COPY scripts ./scripts
RUN corepack pnpm install --frozen-lockfile
RUN corepack pnpm build

FROM node:22-bookworm-slim AS runtime
ARG BUILD_REVISION
LABEL org.opencontainers.image.revision=$BUILD_REVISION
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/data/research-tasks.sqlite
ENV BUILD_REVISION=$BUILD_REVISION
# Keep the existing workspace layout for shared packages and recovery/account CLIs.
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /data /backups && chown node:node /data /backups
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/v1/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/main.js"]
