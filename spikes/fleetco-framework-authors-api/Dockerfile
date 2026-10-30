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
# The migrations are read at startup by `lib/db/migrator.ts`; tsc does not copy
# non-TypeScript files, so they are taken from source into the same relative
# position the compiled output expects.
COPY src/lib/outbox/migrations ./dist/src/lib/outbox/migrations
COPY src/modules/customers/migrations ./dist/src/modules/customers/migrations

# Rule 6: scheduled jobs and one-off commands are plain commands the platform
# merely invokes. Nothing here is specific to a scheduler.
USER node
EXPOSE 8000
CMD ["node", "dist/src/index.js"]
