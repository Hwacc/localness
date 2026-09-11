# Running Localness in Docker

Single container plus one volume. The volume (`/app/runtime`) holds the SQLite
database and, with the `LOCAL` storage engine, the uploaded screenshots —
**losing it loses the data**.

## First run

```bash
cp .env.docker.example .env.docker
# fill in NUXT_SESSION_PASSWORD (32+ chars) and the OSS/OCR values you use
docker compose up -d --build
docker compose logs -f localness      # migrations run before the server starts
```

Then create the first account — there is no public signup:

```bash
docker compose exec localness tsx scripts/register.ts
```

Health check: `curl localhost:13000/api/health` → `{"ok":true,"db":true,...}`.
It returns 503 when the database is unreachable, so an orchestrator can tell a
booted-but-broken container from a healthy one.

## Environment

Everything lives in `.env.docker` (never in the image — `.dockerignore` keeps
`.env*` out of the build context). See `.env.docker.example` for the full list.

Two variables are special:

- **`NUXT_SALT_SIZE`** is also a build argument, because
  `nuxt.config.ts` bakes it into the bundle via `auth.hash.scrypt.saltSize`.
  Keep the build arg and the runtime value equal, and do not change it after
  go-live: existing password hashes depend on it.
- **`NUXT_SESSION_PASSWORD`** is mandatory. The entrypoint refuses to start
  without it rather than serving an app whose logins silently fail. Changing it
  invalidates every session.

`DATABASE_CLIENT` from the old `.env` files is dead — no code reads it.

## Upgrades

```bash
docker compose up -d --build      # rebuild, restart, migrations re-run
```

Migrations are applied by the entrypoint on every boot (`prisma migrate
deploy`), which is idempotent. `I18nKey_FTS*` is declared external in
`prisma.config.ts`, so migrations never drop the search index; the FTS tables
are created by the `init-fts` nitro plugin on first boot.

## Backup and restore

SQLite is a file inside the volume. Stop the container first so no write is in
flight:

```bash
docker compose stop localness
docker run --rm -v localness-runtime:/data -v "$PWD:/backup" busybox \
  tar czf /backup/localness-runtime.tgz -C /data .
docker compose start localness
```

Restore is the same command with `tar xzf` into an empty volume.

## Notes on the image

- `git` is installed on purpose: LILT Git sync shells out to it to clone and
  push, and clones land in the container's `/tmp`.
- Prisma's schema engine target is pinned to `debian-openssl-3.0.x`. Without
  that, the slim base (no `openssl` CLI) makes Prisma download a 1.1.x engine
  the runtime cannot load, and it then fails trying to re-download at boot as a
  non-root user.
- No pnpm at runtime — corepack would re-download it on every boot as the
  unprivileged user. Binaries are called from `node_modules/.bin`.
- `ecosystem.config.cjs` (pm2) is the older, non-container deployment path and
  is excluded from the image; Docker's restart policy replaces it.
