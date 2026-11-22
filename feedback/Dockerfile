# syntax=docker/dockerfile:1

# ── build: compile TypeScript with the dev dependencies ─────────────────────
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ── runtime dependencies only ───────────────────────────────────────────────
FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ── runtime ─────────────────────────────────────────────────────────────────
FROM node:26-alpine
ENV NODE_ENV=production
WORKDIR /app
# The layout mirrors the source tree: dist/ reads ../migrations and ../assets
# relative to its own files, exactly as src/ does under tsx.
COPY --from=deps --chown=root:root /app/node_modules ./node_modules
COPY --from=build --chown=root:root /app/dist ./dist
COPY --chown=root:root package.json ./
COPY --chown=root:root migrations ./migrations
COPY --chown=root:root assets ./assets
# Code owned by root, process run as node: the app cannot rewrite itself.
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/main.js"]
