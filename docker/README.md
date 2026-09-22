# Running Localness in Docker

Single container plus one volume. The volume (`/app/runtime`) holds the SQLite
database and, with the `LOCAL` storage engine, the uploaded screenshots —
**losing it loses the data**.

## First run

Copy `.env.docker.example` to `.env.docker` next to `docker-compose.yml` and
fill in `NUXT_SESSION_PASSWORD` (32+ chars). Keep
`NUXT_PUBLIC_OSS_BASE_URL=/upload/` for LOCAL storage. Then pull the published
image (do not `--build` on the server):

```bash
cp .env.docker.example .env.docker
# fill in NUXT_SESSION_PASSWORD
docker compose pull
docker compose up -d
docker compose logs -f localness      # migrations run before the server starts
```

Pin a version instead of `latest`:

```bash
LOCALNESS_IMAGE=huacc/localness:1.2.0 docker compose pull
LOCALNESS_IMAGE=huacc/localness:1.2.0 docker compose up -d
```

`LOCALNESS_IMAGE` is compose interpolation (shell or a project `.env`). It is
not read from `.env.docker`.

To build a local image instead of pulling Hub:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
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

These need care:

- **`NUXT_SALT_SIZE`** is also a build argument, because
  `nuxt.config.ts` bakes it into the bundle via `auth.hash.scrypt.saltSize`.
  Keep the build arg and the runtime value equal, and do not change it after
  go-live: existing password hashes depend on it.
- **`NUXT_SESSION_PASSWORD`** is mandatory. The entrypoint refuses to start
  without it rather than serving an app whose logins silently fail. Changing it
  invalidates every session.
- **`NUXT_PUBLIC_OSS_BASE_URL`** for `LOCAL` must be `/upload/` (the route that
  reads the volume). Leave it empty and the editor requests `/{uuid}.png`.

`DATABASE_CLIENT` from the old `.env` files is dead — no code reads it.

### AI prompts (optional)

`POST /api/tag/ai/gen-i18n-key` — the AI button in the tag info dialog — is the
only AI call. It needs an OpenAI-compatible endpoint:

```bash
# Shared fallback for every AI feature.
NUXT_OPENAI_API_KEY=
NUXT_OPENAI_BASE_URL=https://api.siliconflow.cn/v1
NUXT_OPENAI_MODEL=Qwen/Qwen3.5-4B

# Per-feature overrides, each falling back on its own to the shared value.
# The suffix is the feature slug in upper snake case: "i18n-key" -> I18N_KEY.
# NUXT_OPENAI_I18N_KEY_API_KEY=
# NUXT_OPENAI_I18N_KEY_BASE_URL=
# NUXT_OPENAI_I18N_KEY_MODEL=
```

A feature override is per knob, not all-or-nothing: giving `i18n-key` its own
model keeps the shared endpoint and key. Overriding all three puts that feature
on a provider of its own.

The system prompts are files rather than code: the image ships them at
`/app/prompts` and the server reads them at runtime, re-reading whenever a file
changes, so editing one takes effect without a restart. To change a prompt
without rebuilding the image, mount a directory over that path — see the
commented example in `docker-compose.yml`. The mount must be readable by uid
1000, which is the image's `node` user (`NUXT_PROMPTS_DIR` moves the path).

A missing or malformed prompt file fails that request with the file's path in the
message, and the failure is not cached, so fixing the file is all it takes.
Leaving `NUXT_OPENAI_API_KEY` unset is not fatal either: the app boots normally
and only this endpoint returns 500.

### Atlassian OAuth (optional)

Leave all four unset and the app runs on username/password only: the login page
shows a disabled "Continue with Atlassian" button and the hint "Atlassian login
is not configured. Contact an admin."

```bash
NUXT_OAUTH_ATLASSIAN_CLIENT_ID=
NUXT_OAUTH_ATLASSIAN_CLIENT_SECRET=
NUXT_OAUTH_ATLASSIAN_REDIRECT_URL=https://<your-origin>/auth/atlassian
NUXT_ATLASSIAN_ALLOWED_EMAIL_DOMAINS=example.com,example.org
```

- Create an OAuth 2.0 (3LO) app at developer.atlassian.com and grant it
  `read:me` and `read:account` under the User identity API. **Scope is decided
  in the console, not in this repo** — the app code cannot narrow what the 3LO
  app is allowed to do. All we need from the profile is the email.
- The callback registered on the app must match
  `NUXT_OAUTH_ATLASSIAN_REDIRECT_URL` exactly, path included
  (`<your-origin>/auth/atlassian`). Behind a reverse proxy that is the public
  origin, not `localhost:13000`. Left empty, nuxt-auth-utils rebuilds it from
  the incoming request (`protocol://host/path`), which is what a proxy rewrites
  — so set it explicitly anywhere but plain localhost.
- **`NUXT_ATLASSIAN_ALLOWED_EMAIL_DOMAINS` empty means deny everyone**, not
  allow everyone (`isEmailDomainAllowed` returns false on an empty list). The
  button is enabled as soon as the client id and secret are set, so leaving the
  allowlist out gives you a button that always bounces back to `/` with
  `?oauth_error=domain`. Comma-separated, no `@`, case-insensitive.
- Access tokens are never stored. A successful sign-in keeps only an
  `AuthIdentity` row keyed by the Atlassian `account_id` — deliberately not
  email, so a renamed mailbox does not orphan the account.
- First sign-in from an allowed domain provisions a `USER` just in time, with a
  random unusable password. An account that already exists locally is **not**
  matched by email: its owner links it from User Settings → Connect while
  logged in.
- Never commit real domains, the client id, or the secret. They belong in
  `.env.docker`, which `.dockerignore` keeps out of the build context.

## Upgrades

From the compose directory (`/home/rcddev/localness` on the intranet host):

```bash
./update.sh 0.1.2    # pin a version
./update.sh          # latest
```

The script pulls Hub, recreates the container, and **does not** pass `-v`.
It then waits up to 90s for `GET /api/health` (migrate runs before listen).
A Hub timeout (`registry-1.docker.io` Client.Timeout) stops **before** `up`,
so the running container stays on the last successful image. Retry, or set a
daemon registry mirror on the host — do not `--build` on the server.
`sudo` is required if your user is not in the `docker` group. Equivalent by
hand:

```bash
LOCALNESS_IMAGE=huacc/localness:1.3.0 docker compose pull
LOCALNESS_IMAGE=huacc/localness:1.3.0 docker compose up -d
```

Migrations are applied by the entrypoint on every boot (`prisma migrate
deploy`), which is idempotent.

### Backfilling the source language (one-off)

A key's original text used to be `I18nKey.origin` on its own. It now lives in the
**source language** (`ProjectSettings.localeFallback`), as that locale's
`draftText`, and a later release drops the column. Between those two releases run
this once, from the same directory as `update.sh`:

```bash
./backfill-source-locale.sh           # report only — writes nothing
./backfill-source-locale.sh --apply   # copy the database, backfill, re-check
```

It pipes the backfill script into the running container (the image may predate
it, since it has to run before the release that drops the column), copies the
database with SQLite's `VACUUM INTO` into `./backups/` — consistent without
stopping the container — and then backfills. The last two lines of the report
must both read `0` before deploying the release that drops the column. Keys whose
source-language row already holds a *different* text are listed and left as they
are: those are the ones to look at by hand.

## Publishing an image

GitHub Actions publishes `huacc/localness` on a **semver git tag**, not on
merge to `main`.

```bash
git tag v1.2.0
git push origin v1.2.0
```

Do not edit `package.json` version first. The release workflow writes it from
the tag (into the image build, then a commit on the default branch).

Hub tags: `1.2.0`, `1.2`, and `latest`. Pre-release tags (`v1.3.0-rc.1`) push
only `1.3.0-rc.1` and leave `latest` / `1.3` alone.

A tag also opens a **GitHub Release** whose body is `git log` since the
previous `v*` tag. Docker Hub's Tags page has no changelog column and the
Overview API rejects a push-only token (`403 Forbidden`), so Overview is
**not** rewritten in CI. The image label
`org.opencontainers.image.documentation` points at the GitHub Release.

Repo secrets (Actions → Secrets): `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`
(registry push is enough; Read/Write/Delete is not required).
`NUXT_SALT_SIZE` is fixed at `10` in the release workflow; do not change it
after go-live.

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
- Docker is the only deployment path. The older pm2 one (`ecosystem.config.cjs`
  plus the `*:prod` package scripts) was removed on 2026-09-14: it started the
  server without running migrations, and its hardcoded `DATABASE_URL` overrode
  `.env.production`, so `prisma migrate deploy` could migrate a different file
  than the server opened. Docker's restart policy replaces pm2.
