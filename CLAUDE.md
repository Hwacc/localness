# Localness

Screenshot tagging + i18n key store. **Not** a headless CMS.

Product memory: Obsidian vault `项目/Localness.md` and `项目/Localness/`. Read those before non-trivial work; write decisions back there. **Do not duplicate narrative in this file.** No secrets, `.env` values, or internal URLs in the repo or vault.

## Commands

**pnpm**.

```bash
pnpm install
pnpm dev                 # http://localhost:3000
pnpm typecheck           # verification (not `pnpm build`)
pnpm test                # unit tests
pnpm exec prisma generate
pnpm exec prisma migrate dev
```

No public register. Users: `pnpm register` / `docker compose exec localness tsx scripts/register.ts`.

Deploy is Docker only. The image runs `prisma migrate deploy` on boot. `pnpm dev` does not — a nitro plugin warns; apply locally with `migrate dev`.

## Verify

`pnpm typecheck` + `pnpm test`. Do not run `pnpm test:api` or `pnpm build` to check work. Do not drive the browser. After UI changes, list short manual test points (route, click, expected).

## Layout

Nuxt 4 · Vue 3 · Prisma (client → `prisma/client`) · SQLite · `@nuxt/ui` · Pinia · nuxt-auth-utils · Leafer.

- `app/` client, `server/` API, `shared/` constants and utils.
- `#server` → `server/`; `#shared/*` is shared.
- `modals/` and `slideovers/`: **no pathPrefix**.
- New dialect SQL only in `server/libs/`. Do not add `pg` / `mysql2` until a cutover sprint. UI default dark; copy is English.

## Invariants agents miss

- I18n keys unique per Project. One `LocaleValue` per locale (`draftText` + `publishedText`). Do not add a second copy table (Vue/React, Release, Git, …).
- Draft key display: **always** `import { formatI18nKeyDisplay } from '#shared/utils'`.
- Export row rules live in `server/helper/export-rows.ts` — keep them there and tested.
- A Team may have several OWNERs but never zero. Promote / demote / remove / leave / delete-team all consult `server/helper/team-membership.ts` — add rules there, not in the handlers.
- `/editor` and `/git` are `ssr: false`. Switching project must not change the route.
- Editor lock is `settings.locked` / `tagLocked`, not Leafer `Box.locked`. Draw mode: `select: 'tap'` + `rectThrough` so a locked large tag still accepts new boxes.
- Git GET never returns the token. Do not reuse `I18nMigrateConflict`. Full `/git` spec is in the vault.
- Imports at top of file. Exhaustive `switch` with `default: never`. Do not commit or push unless asked.
