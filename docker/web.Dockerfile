# ---- deps: full install (incl. devDependencies), used for building ----
FROM node:20-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/security/package.json packages/security/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/media-extractor/package.json packages/media-extractor/package.json
RUN npm ci

# ---- builder ----
FROM deps AS builder
COPY packages ./packages
COPY apps/web ./apps/web

# Only packages/types is used by apps/web, and only as `import type` —
# fully erased at build time — but Next's own typecheck step still
# needs the source resolvable via apps/web/tsconfig.json's path mapping,
# which points at packages/types/src directly, so no build step is
# required here.
WORKDIR /app/apps/web
RUN npm run build

# ---- runner: prod-only deps + compiled output ----
FROM node:20-slim AS runner
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# NOTE: copies every workspace's package.json — see docker/api.Dockerfile
# for why.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/security/package.json packages/security/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/media-extractor/package.json packages/media-extractor/package.json
RUN npm ci --omit=dev

COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/next.config.js ./apps/web/next.config.js

WORKDIR /app/apps/web

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

EXPOSE 3000
CMD ["npm", "run", "start"]
