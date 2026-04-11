# Frontend Dockerfile — Noted SPA (Vue 3 + Vite → Nginx)
# Multi-stage build: npm build → serve with Nginx Alpine

# --- Stage 1: Build ---
FROM node:20-alpine AS build
WORKDIR /app

ARG VITE_APP_VERSION=0.0.0

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Remove dev .env so VITE_ENV_LABEL is unset in production build
RUN rm -f .env .env.local .env.development

ENV VITE_APP_VERSION=${VITE_APP_VERSION}

RUN npm run build

# --- Stage 2: Serve ---
FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html

# Nginx config is mounted from host via docker-compose
# Remove default config so our mounted one takes effect
RUN rm /etc/nginx/conf.d/default.conf

EXPOSE 80 443

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
