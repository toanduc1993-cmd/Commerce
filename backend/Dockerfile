# ─────────────────────────────────────────────────────────────────────────────
# IBS Procurement Backend — Multi-stage Dockerfile (Node 22 Alpine)
# ─────────────────────────────────────────────────────────────────────────────

# ─── Stage 1: deps (full, gồm cả dev để chạy prisma generate) ───────────────
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund && \
    npx prisma generate

# ─── Stage 2: prod-deps (chỉ production deps) ───────────────────────────────
FROM node:22-alpine AS prod-deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci --omit=dev --no-audit --no-fund && \
    npx prisma generate

# ─── Stage 3: runtime ────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache openssl tini wget && \
    addgroup -S ibshi && adduser -S ibshi -G ibshi

ENV NODE_ENV=production \
    PORT=5005 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

# Production node_modules (đã có @prisma/client generated)
COPY --from=prod-deps --chown=ibshi:ibshi /app/node_modules ./node_modules
# Prisma CLI binary từ full deps (để chạy `npx prisma migrate deploy`)
COPY --from=deps --chown=ibshi:ibshi /app/node_modules/prisma ./node_modules/prisma
COPY --from=deps --chown=ibshi:ibshi /app/node_modules/@prisma/engines ./node_modules/@prisma/engines

COPY --chown=ibshi:ibshi src ./src
COPY --chown=ibshi:ibshi prisma ./prisma
COPY --chown=ibshi:ibshi run_seed.js ./
COPY --chown=ibshi:ibshi package.json ./

RUN mkdir -p /app/uploads && chown -R ibshi:ibshi /app/uploads

USER ibshi
EXPOSE 5005

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5005/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/app.js"]
