# syntax=docker/dockerfile:1

# ------------------------------------------------------------------
# Dependencies
# ------------------------------------------------------------------
FROM node:22-trixie-slim AS deps
WORKDIR /app

# better-sqlite3 ships prebuilt binaries for this platform, but keep the
# toolchain available so a fallback source build can still succeed.
#
# The base image must be Debian trixie or newer: better-sqlite3's prebuilt
# binary is linked against glibc 2.38, and bookworm only ships 2.36 — the
# image builds fine either way but crashes on the first database call.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

# ------------------------------------------------------------------
# Build
# ------------------------------------------------------------------
FROM node:22-trixie-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# A build-time secret is never used at runtime — the real one comes from the
# environment — but the build must not fail on the production guard.
ENV APP_SECRET=build-time-placeholder
RUN npm run build

# ------------------------------------------------------------------
# Runtime
# ------------------------------------------------------------------
FROM node:22-trixie-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_PATH=/data/mailcatcher.db

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs \
    && mkdir -p /data && chown nextjs:nodejs /data

# `output: standalone` emits a self-contained server with only the modules it
# actually uses, which keeps the image small.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Migrations run at start-up, so a fresh volume becomes a working database.
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/scripts/docker-entrypoint.mjs ./scripts/docker-entrypoint.mjs

USER nextjs
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "scripts/docker-entrypoint.mjs"]
