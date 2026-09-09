# Localness

Product name: **Localness**. This repo folder is still `coze-i18n` and will be renamed later.

Screenshot tagging plus a translation key store (Project → Page → Tag → I18nKey / LocaleValue). **Not** a headless CMS. Do not grow Schema-driven content modules in the Localess/Strapi sense.

Long-lived product memory lives in the Obsidian vault:

- `项目/Localness.md`
- `项目/Localness/方案调研.md`

Read those before non-trivial work. After product or architecture decisions, write back to the vault. Do not put internal repo names, URLs, or secrets in notes.

## Commands

Package manager: **pnpm**.

```bash
pnpm install
pnpm dev                 # http://localhost:3000
pnpm build
pnpm exec prisma generate
pnpm exec prisma migrate dev
```

There is no public register API. Create users with `scripts/register.ts` (prod: `register:prod`).

## Stack

Nuxt 4 · Vue 3 · Prisma · SQLite · @nuxt/ui · Pinia · nuxt-auth-utils · Leafer (canvas)

- UI default is **dark**. Visible copy is hardcoded English for now.
- `app/` client, `server/` API, `shared/` constants and utils, `prisma/schema.prisma` schema.
- Prisma client emits to `prisma/client` (see generator in schema).
- `#server` → `server/`; `#shared/*` is shared by client and server.
- `modals/` and `slideovers/` have **no pathPrefix** — import by filename.

## Domain (locked)

- I18n keys are unique **per Project** (`projectId + key`).
- Tags that share a key share one `I18nKey` row.
- Teams own projects: joining a Team shows all of that Team's projects. Team roles: `OWNER` | `MEMBER`. Only a Team OWNER creates projects; only platform `ADMIN` creates Teams.
- One `LocaleValue` per locale: `draftText` + `publishedText`. Do **not** split Vue/React into two wide tables. Namespaces are not two real copy sets yet.
- First-ship string type is `STRING` only.
- Status: **Draft** if never published, or any locale draft ≠ published; otherwise **Published**.
- Export (xlsx / JSON) uses **published** text. JSON: `GET /api/projects/:id/translations/:locale?version=published`.
- Auto draft keys: `__draft_<fingerprint>`. Display via `formatI18nKeyDisplay` (`__draft_` + first 5 hash chars). **Always** `import { formatI18nKeyDisplay } from '#shared/utils'` — do not rely on auto-import in templates or TSX.
- No public signup. A Team invite code is **not** a registration code (see P1).

## Routes

| Path | Notes |
|------|--------|
| `/` | Login |
| `/dashboard` | Post-login home; no workspace bar |
| `/editor` | **ssr: false** (sider project fetch needs cookies) |
| `/translations` | Key table |
| `/teams` | Teams; invite by existing username |

Switching project must not change the current route.

## Editor (`app/core/`)

Leafer: `groupTree` holds the image plus `groupTag`. Tags sit on top of the image. Lock disables move/resize only — it is **not** a z-index change.

| Mode | Behavior |
|------|----------|
| `draw` (default) | Click selects; drag draws a new box (must work on a locked large tag: `select: 'tap'` + `rectThrough`) |
| `edit` | Move/resize unlocked boxes |
| `drag` | Pan the canvas; tags must not steal hits |

Persist lock on `settings.locked` through the tag update API. `FuncLockBtn` uses `tagLocked`, not Leafer `Box.locked`.

## Conventions

- Keep imports at the top of the file. No inline `import()` in function bodies unless a documented cycle requires it.
- Switches over unions/enums need a `default` `never` exhaustive check.
- Touch only files the task needs. Do not commit or push unless the user asks.
- Never write secrets, `.env` values, or internal URLs into the repo or vault.
- After UI behavior changes, verify in the browser on the affected flows — a screenshot is not enough.

## Roadmap (do not implement unless asked)

**P0 — Bidirectional Git file sync (Bitbucket)**  
Push files that match **that repo's** path/format rules; pull into Translations. Push **published** only. Conflicts are first-class: three-way merge per `key + locale` (`base` = last successful sync). If both sides changed and the strings differ, queue a conflict. Block Push while conflicts are open. Pull updates **draft** only by default. Do not reuse `I18nMigrateConflict` (one-shot Vue/React migration table).

**P1 — Atlassian login + Team invite codes**  
Invite codes let an **already logged-in user join a Team**. They do not create accounts. Atlassian is how people get accounts. Users with no Team may log in but see no projects.
