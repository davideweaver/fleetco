# ADR-022 rule 1: a plain Dockerfile. No platform buildpack, no proprietary
# build step. The image that runs in production runs under `docker run` locally.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Plain SQL migrations are read at runtime by `npm run migrate`, which the
# platform invokes as its own task (ADR-022 rule 6).
COPY src/platform/outbox/migrations ./src/platform/outbox/migrations
COPY src/modules/customers/migrations ./src/modules/customers/migrations

# Unprivileged, and PID 1 is node so SIGTERM reaches the shutdown handler
# directly rather than through a shell that would swallow it.
USER node
EXPOSE 3000
CMD ["node", "dist/src/main.js"]
