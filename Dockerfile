# syntax=docker/dockerfile:1

# Debian slim, not alpine: better-sqlite3 (via the Prisma adapter) ships glibc
# prebuilds, and the Prisma engines want openssl.
ARG NODE_IMAGE=node:22-slim

# ---------- deps ----------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# The slim image has no libssl and no `openssl` CLI, so Prisma's platform
# detection falls back to openssl-1.1.x and downloads a schema engine the
# runtime cannot load. Pin the target and install libssl instead of guessing.
ENV PRISMA_CLI_BINARY_TARGETS=debian-openssl-3.0.x
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
# `nuxt prepare` runs as postinstall and needs the config it reads.
# pnpm-workspace.yaml is not optional: it carries `onlyBuiltDependencies`, and
# pnpm 10 skips install scripts for anything not listed there — without it
# better-sqlite3 ships no compiled binding and Prisma fetches no engines.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nuxt.config.ts prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate \
  && pnpm install --frozen-lockfile

# ---------- build ----------
FROM deps AS build
WORKDIR /app
# Baked into the bundle through nuxt.config's auth.hash.scrypt.saltSize, so it
# is a build input as well as a runtime one. Do not change it after go-live:
# existing password hashes were made with this value.
ARG NUXT_SALT_SIZE=10
ENV NUXT_SALT_SIZE=$NUXT_SALT_SIZE
# Required: the nitro `compiled` hook that patches __dirname for the generated
# Prisma client only runs when NODE_ENV is production.
ENV NODE_ENV=production
# prisma.config.ts resolves DATABASE_URL eagerly, so `generate` needs a value
# even though it never connects. The runtime stage sets the real one.
ENV DATABASE_URL=file:/app/runtime/db/localness.db
COPY . .
RUN pnpm exec prisma generate \
  # The deps stage ran `nuxt prepare` before app/ existed, so its .nuxt has no
  # path mappings for ~/components — SFC type imports fail to resolve with it.
  && rm -rf .nuxt \
  && pnpm exec nuxt prepare \
  && pnpm build

# ---------- runtime deps ----------
# Separate from the build tree so we can drop lint/test packages. Prisma CLI
# and tsx stay because they are production dependencies (migrate + register).
FROM deps AS runtime-deps
WORKDIR /app
ENV NODE_ENV=production
# Skip lifecycle scripts: `postinstall` is `nuxt prepare`, which imports
# `@tailwindcss/vite` from nuxt.config. That package is a devDependency and is
# gone after prune. Runtime only needs node_modules for Prisma/tsx/native addons.
RUN pnpm prune --prod --ignore-scripts \
  && test -x node_modules/.bin/prisma && test -x node_modules/.bin/tsx

# ---------- runtime ----------
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
# No pnpm at runtime: corepack would try to download it as the unprivileged
# user on every boot. Binaries are called through node_modules/.bin instead.
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    PATH=/app/node_modules/.bin:$PATH \
    DATABASE_URL=file:/app/runtime/db/localness.db \
    NUXT_LOCAL_OSS_DIR=/app/runtime/uploads
# git is a hard requirement: LILT Git sync shells out to it to clone and push.
# openssl: the Prisma schema engine links against libssl at migrate time.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/.output ./.output
COPY --from=runtime-deps /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/shared ./shared
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/prisma.config.ts /app/tsconfig.json ./
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

# `runtime/` is the only mutable state (SQLite + local uploads); it is a volume.
RUN chmod +x /usr/local/bin/entrypoint.sh \
  && mkdir -p /app/runtime/db /app/runtime/uploads \
  && chown -R node:node /app/runtime
USER node

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", ".output/server/index.mjs"]
