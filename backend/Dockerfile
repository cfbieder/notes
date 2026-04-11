# Backend Dockerfile — Noted API (Fastify)
# Multi-stage build: install deps → production image

# --- Stage 1: Install dependencies ---
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- Stage 2: Production image ---
FROM node:20-alpine
WORKDIR /app

RUN addgroup -S noted && adduser -S noted -G noted

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src/ ./src/
COPY migrations/ ./migrations/

RUN mkdir -p uploads logs && chown -R noted:noted /app

USER noted

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1

CMD ["node", "src/app.js"]
