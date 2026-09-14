# Localness

Product name: **Localness**. This repo folder is now `localness` (renamed from `coze-i18n` on 2026-09-14).

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
pnpm typecheck           # verification (preferred over build)
pnpm test                # unit tests
pnpm exec prisma generate
pnpm exec prisma migrate dev
pnpm build               # ship / production only — not a verification step
```

There is no public register API. Create users with `scripts/register.ts` (prod: `register:prod`).

## Verify

After code changes, run **typecheck + unit tests**. Do **not** run `pnpm test:api` (paused — boots a full Nuxt server, too slow). Do **not** use `pnpm build` to check work (slow, not the signal we want).

Do **not** drive the browser (Playwright, CDP, Cursor browser tools) for UI checks — too slow. Leave UI to humans. After a UI change, the reply must list **short manual test points** (route, what to click, expected). A screenshot or a long checklist is not required.

## Stack

Nuxt 4 · Vue 3 · Prisma · SQLite · @nuxt/ui · Pinia · nuxt-auth-utils · Leafer (canvas)

- UI default is **dark**. Visible copy is hardcoded English for now.
- `app/` client, `server/` API, `shared/` constants and utils, `prisma/schema.prisma` schema.
- Prisma client emits to `prisma/client` (see generator in schema). Default store is **SQLite** (prototype / single-node). PostgreSQL is the named later cutover — not a runtime toggle, not MySQL in parallel. New dialect SQL belongs in `server/libs/`, not handlers. Do not add `pg` / `mysql2` until that sprint. Rationale: vault `项目/Localness.md` → 数据存储.
- `#server` → `server/`; `#shared/*` is shared by client and server.
- `modals/` and `slideovers/` have **no pathPrefix** — import by filename.

## Domain (locked)

- I18n keys are unique **per Project** (`projectId + key`).
- Tags that share a key share one `I18nKey` row.
- Teams own projects: joining a Team shows all of that Team's projects. Team roles: `OWNER` | `MEMBER`. Only a Team OWNER creates projects; only platform `ADMIN` creates Teams.
- One `LocaleValue` per locale: `draftText` + `publishedText`. Do **not** split Vue/React into two wide tables. Namespaces are not two real copy sets yet.
- First-ship string type is `STRING` only.
- `ProjectSettings.locales` is written once at project creation and **no API or UI edits it** — locale-scoped features are effectively no-ops (always the 10 defaults) until that ships. Read it via `parseLocales` with the `DEFAULT_LOCALES` fallback; note `DEFAULT_LOCALES` and `TRANSLATION_LANGUAGES` order differ (`es`/`fr` swapped).
- Status: **Draft** if never published, or any locale draft ≠ published; otherwise **Published**.
- Export (xlsx / JSON) uses **published** text. JSON: `GET /api/projects/:id/translations/:locale?version=published`.
- Project export takes an **explicit selection** (`pages` + `keyIds` + `locales`), never filters — filtering happens in the step 2 picker table. One xlsx sheet `translations`, columns `id | key_id | pic | key | origin | <locales>`; a selected key with no tag on those pages still gets a row with an empty `pic`; a key with no published text produces none. Row rules live in `server/helper/export-rows.ts` — keep them there and tested.
- Auto draft keys: `__draft_<fingerprint>`. Display via `formatI18nKeyDisplay` (`__draft_` + first 5 hash chars). **Always** `import { formatI18nKeyDisplay } from '#shared/utils'` — do not rely on auto-import in templates or TSX.
- No public signup. A Team invite code is **not** a registration code (see P1). Logged-in users redeem via `POST /api/teams/join` (redeem = consent). Username invite is **pending**: it writes a `TEAM_INVITE` inbox row; Accept in the left-rail Inbox drawer creates `UserTeam`. Inviting someone already on the team is 409 (does not change role).

## Git file sync (`/git`)

LILT-style product folders: `<product>/source/` and `<product>/translated/`, flat `{ "id": "string" }` JSON. One Localness Project maps to one **product**. Unique `(adapter, remoteUrl, product)`. OWNER must set the HTTPS Git clone URL (`…/workspace/repo.git`) on `/git`; Bitbucket browser pages (`/src/<branch>/`) are normalized to that clone URL. There is **no** server default remote. Product options are **listed from that remote** (folders that contain `source/` or `translated/`), not a hardcoded whitelist. Load products also requires a token because it clones the remote.

Both Pull and Push are **three-step: machine filter → human confirmation → execute**. The automatic filter only ever produces a *default proposal*; the user may uncheck it or check things it filtered out. A `preview` call does not commit Git. It **does** write open `/git` conflict cards for `conflict` rows so they can be resolved before Apply.

- **Pull** lands confirmed Git text as the platform copy: **draft and published** for `apply-theirs` (skip `__draft_*`). `keep-ours` does not overwrite. `preview` clones once (sparse checkout of the product folder), classifies every batch file as `new-file` / `changed-file` / `seen-file`, stores a snapshot as `GitSyncPreview` (15 min TTL), and upserts open conflict cards (same as Push). New and changed files are proposed by default; a `seen-file` is listed only while it still holds an `apply-theirs` or `conflict` row (no “show already pulled” toggle). Within the selected files, later filename **date** wins; on the same day, Localness timed batches (`HHMMSS-hex`) rank after connector uuid batches so a push is not overwritten by an older same-day file. Source locale files live under `source/`; other locales under `translated/` (do not hand-edit `translated/`).
- **Pull apply** re-checks the remote head with `git ls-remote` (a handshake, no clone). Same sha → reuse the snapshot filtered by the user's selection. Different sha → **409**, run a new preview. **409** if this preview still has unresolved conflict cards — Apply does not land Git-ahead rows until those cards are resolved. Conflict rows are not selectable. Resolving a card writes the chosen platform text and sets `GitSyncBase` to **Git theirs** (so Use platform does not come back as `apply-theirs`). Preview only lists `apply-theirs` and `conflict`. When every conflict in the review is resolved and no Git-ahead rows remain, the review closes. Writes run in one transaction. Only files the user **accepted** are recorded as seen, so a skipped file stays a candidate next time. Apply is the confirmation — there is no extra publish step for applied rows.
- **Push** proposes **published source strings that are new or changed** since the last successful landing (`GitSyncBase`), after three-way against live `source/` (preview clones the product folder). Reasons: `new-key` / `changed` / `unchanged` / `not-published` / `draft-key` / `remote-changed` / `conflict`. `conflict` rows are written as open `/git` cards during **preview** (not only apply). Empty delta is explainable rather than a bare error. Open conflicts → **409**. The review table shows the proposal plus rows still needing a decision (`remote-changed`, `conflict`); other reasons are reached only by picking that reason in the status filter, which overrides that gate. Bulk selection is the table header checkbox — no “show filtered out” toggle, no select-visible buttons.
- **Push apply** re-reads `publishedText` from the database and live `source/` instead of trusting the snapshot. Confirmed keys are written as an **incremental** `source/` batch (only the overlay, LILT-style). Unpushed keys remain in older files; later date / Localness timed rank still wins on merge. `remote-changed` is skipped unless the user checks it (overwrite Git); both-changed keys are skipped and become `/git` conflict cards. Empty overlay → 400, or 409 if only conflicts. A key unpublished since preview is `skipped`.
- **Pull preview** merges every batch file, not only new/changed ones, so a seen file that is still Git-ahead still appears as `apply-theirs` (otherwise Push skips it and Pull hid it).
- Three-way per `key + locale`: `GitSyncBase` (last successful landing). **Pull** ours = platform draft, theirs = Git (any locale). **Push** ours = published source, theirs = merged `source/`. `publishedText` is reference-only on Pull.
- `GitSyncBinding.seenFiles` stores `{ path, sha }` (git blob sha), so a rewritten file is detected as changed rather than silently skipped. Legacy `string[]` rows are still read and count as seen. Paths are never returned to the client outside a preview.
- Dual-track credentials on `GitSyncBinding.credentialKind` (OWNER writes; GET never returns the token, only `tokenConfigured`):
  - `repo_access_token` → Git HTTPS user `x-token-auth`
  - `api_token` → Git HTTPS user `x-bitbucket-api-token-auth`
  Token is the password. Those usernames are protocol sentinels, not login names. Do not use Bitbucket App Passwords.
- Team members start Pull/Push. Unconfigured MEMBER sees “Contact the project owner…”. Conflicts are cards on `/git` (Use Git / Use platform / Edit). Do **not** reuse `I18nMigrateConflict`.

- History: `GitSyncLog` is append-only and only records runs that **did** something (`pull-apply` / `push-apply` / `conflict-resolve`) — never previews. Write it in the same transaction as the effect it describes. `detail` holds summaries only: key names and the batch filename are fine, translation text and repo paths are not. Actor is `userID`.

APIs: `GET/PUT /api/projects/:id/git-sync`, `POST .../products` (OWNER; clone remote and list `source/`/`translated/` folders), `POST .../pull/preview`, `POST .../pull/apply`, `POST .../push/preview`, `POST .../push/apply`, `GET .../conflicts`, `POST .../conflicts/:id/resolve`, `GET .../history` (cursor `?cursor=<last id>&limit=&action=`). There is no one-shot pull/push endpoint — apply always takes a `previewId` plus the confirmed selection.

## Routes

| Path | Notes |
|------|--------|
| `/` | Login |
| `/dashboard` | Post-login home; no workspace bar |
| `/editor` | **ssr: false** (sider project fetch needs cookies) |
| `/translations` | Key table; can create keys with no tag |
| `/git` | Git sync; **ssr: false**; Pull/Push review panels + conflict cards |
| `/teams` | Teams; join by invite code; OWNER invite-by-username (pending) + invite codes |

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
- After UI behavior changes, list short manual test points; do not automate the browser.

## Roadmap (do not implement unless asked)

**P0 — Bidirectional Git file sync** — shipped: `/git`, dual-track tokens, three-way conflicts, preview/confirm/apply for both directions. Do not put tokens or internal remotes in docs.

**P1 — Atlassian login + Team invite codes**  
Invite codes are **shipped**. Username invite now goes through the **Inbox** (left rail, above Settings): Accept / Decline in the drawer. **Atlassian login is not done.** Users with no Team may log in but see no projects until they join.

**P2 — Multi-platform (Vue / React) is a JSON-generation concern, not storage**  
Copy stays **one set**. A framework profile may later shape *generated output* only; it is never a second copy set. The current `:framework` route param, `shapeI18nKey`'s `vue`/`react` copy and the `TranslationLinkModal` switcher are vestigial — remove them in their own change. Rationale in the vault (`项目/Localness.md` → P2).
