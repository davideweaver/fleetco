# A plain Dockerfile — no platform buildpack, no proprietary build step
# (ADR-022 rule 1). The image that runs in production runs under `docker run`
# locally with the same command.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
# dumb-init is deliberately absent: `main.ts` installs its own SIGTERM handler
# because SSE draining needs application-level control (ADR-022 rule 7).
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# The migration SQL is read at runtime by `npm run migrate`, which the platform
# invokes as a plain command (ADR-022 rule 6).
COPY src/platform/outbox/migrations ./dist/platform/outbox/migrations
COPY src/modules/customers/migrations ./dist/modules/customers/migrations
COPY package.json ./

USER node
EXPOSE 3000
# Logs go to stdout as JSON in production via the Nest logger (ADR-022 rule 4).
CMD ["node", "dist/main.js"]
