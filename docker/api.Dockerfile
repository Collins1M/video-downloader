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
RUN npm ci --audit=false

# ---- builder: compile everything needed for apps/api ----
FROM deps AS builder
COPY packages ./packages
COPY apps/api ./apps/api

RUN npm run db:generate
RUN npm run build:packages
WORKDIR /app/apps/api
RUN npm run build

# ---- runner: prod-only deps + compiled output + runtime tools ----
FROM node:20-slim AS runner
WORKDIR /app

# yt-dlp is invoked at request time (see apps/api README), not just at
# build time, so it — and its Python runtime — must be in this final
# image, not only the builder stage above.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip curl ca-certificates \
    && pip3 install --break-system-packages --no-cache-dir yt-dlp \
    && rm -rf /var/lib/apt/lists/* \
    && addgroup --gid 1001 --system nodejs \
    && adduser --system --uid 1001 nodejs

ENV NODE_ENV=production

# NOTE: copies every workspace's package.json (not just apps/api's),
# even though this image only runs apps/api. `npm ci` operates against
# the whole-repo package-lock.json, and this sandbox has no Docker
# available to verify whether a partial workspace subset is tolerated —
# copying everything is the safe choice over guessing wrong and shipping
# a build that fails in CI. Trade-off: this image's node_modules
# includes apps/web's and apps/worker's production dependencies too,
# which it never uses. Follow-up: verify the leaner subset works once
# the docker-build CI job (.github/workflows/ci.yml) has run for real.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/security/package.json packages/security/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/media-extractor/package.json packages/media-extractor/package.json
RUN npm ci --omit=dev --audit=false

# The prod-only install above never ran `prisma generate`, so the
# generated client is missing from node_modules — carry it over from
# the builder stage instead of regenerating it.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/config/dist ./packages/config/dist
COPY --from=builder /app/packages/security/dist ./packages/security/dist
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/media-extractor/dist ./packages/media-extractor/dist
# Kept for `prisma migrate deploy` at deploy time (see docs/DEPLOYMENT.md) —
# not needed by the running app itself.
COPY --from=builder /app/packages/database/prisma ./packages/database/prisma
COPY --from=builder /app/apps/api/dist ./apps/api/dist

WORKDIR /app/apps/api

USER nodejs

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

CMD ["node", "dist/main.js"]
