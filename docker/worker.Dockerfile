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

# ---- builder: compile everything needed for apps/worker ----
FROM deps AS builder
COPY packages ./packages
COPY apps/worker ./apps/worker

RUN npm run db:generate
RUN npm run build:packages
WORKDIR /app/apps/worker
RUN npm run build

# ---- runner: prod-only deps + compiled output + runtime tools ----
FROM node:20-slim AS runner
WORKDIR /app

# FFmpeg does the merging/remuxing (Section 12). yt-dlp is the extraction
# engine. Both are invoked at request time — see apps/worker README.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip curl ca-certificates \
    && pip3 install --break-system-packages --no-cache-dir yt-dlp \
    && rm -rf /var/lib/apt/lists/* \
    && addgroup --gid 1001 --system nodejs \
    && adduser --system --uid 1001 nodejs

ENV NODE_ENV=production

# NOTE: copies every workspace's package.json (not just apps/worker's) —
# see docker/api.Dockerfile for why (no Docker available in the sandbox
# this was built in to verify a partial-subset `npm ci` works against
# the whole-repo lockfile). Same bloat trade-off applies here.
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

COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/config/dist ./packages/config/dist
COPY --from=builder /app/packages/security/dist ./packages/security/dist
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/media-extractor/dist ./packages/media-extractor/dist
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist

# Temp processing files (Section 9) — mounted as a shared volume with the
# api container in docker-compose.yml so the api process can stream a
# completed job's output file back to the browser.
RUN mkdir -p /var/tmp/video-downloader && chown nodejs:nodejs /var/tmp/video-downloader

WORKDIR /app/apps/worker

USER nodejs

EXPOSE 9091

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const fs=require('fs');const t=parseInt(fs.readFileSync('/tmp/worker-heartbeat','utf8'),10);process.exit((Date.now()-t)<45000?0:1)" || exit 1

CMD ["node", "dist/main.js"]
