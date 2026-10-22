<div align="center">
  <img src="docs/assets/logo.png" alt="Localness logo" width="120" />
  <h1>Localness</h1>
  <p><strong>The step before your TMS: tag UI screenshots, own your i18n keys, hand off clean source text.</strong></p>
  <p>
    <img alt="Nuxt 4" src="https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxt&logoColor=white" />
    <img alt="Vue 3" src="https://img.shields.io/badge/Vue-3-4FC08D?logo=vuedotjs&logoColor=white" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" />
    <img alt="Prisma" src="https://img.shields.io/badge/Prisma-SQLite-2D3748?logo=prisma&logoColor=white" />
    <img alt="Docker" src="https://img.shields.io/badge/Docker-self--hosted-2496ED?logo=docker&logoColor=white" />
    <img alt="License: Elastic 2.0" src="https://img.shields.io/badge/License-Elastic%202.0-005571" />
  </p>
  <p><strong>English</strong> · <a href="README.zh-CN.md">简体中文</a></p>
</div>

---

## What is Localness?

Localness is the step **before** a translation management system (TMS). It is built for
**designers and developers**, not for translators.

Most localization pain starts before translation: strings are pulled out of designs by hand,
keys are named inconsistently, the same sentence lives under three keys, and translators get
text with no idea where it appears. Localness fixes that end of the pipeline, then hands the
source text to whichever TMS you already use and brings the translations back for developers.

```mermaid
flowchart LR
    D["🎨 Designers<br/>Figma frames · UI screenshots"]
    subgraph L["Localness"]
        direction TB
        T["Tag regions<br/>on screenshots"]
        K["Name, dedupe &<br/>check i18n keys"]
        P["Publish<br/>source text"]
        T --> K --> P
    end
    G[("Git repository")]
    TMS["🌐 Your TMS<br/>LILT · Crowdin · Lokalise · Phrase<br/><i>translators · review · TM</i>"]
    DEV["💻 Developers<br/>Export · Delivery API · MCP"]

    D -->|Figma plugin · upload| T
    P -->|push source| G
    G <-->|TMS Git connector| TMS
    G -->|pull translations| K
    L --> DEV

    classDef ext fill:#1f2937,stroke:#6b7280,color:#e5e7eb
    classDef core fill:#064e3b,stroke:#10b981,color:#ecfdf5
    class D,TMS,DEV,G ext
    class T,K,P core
```

### What it does

At its core, Localness binds three facts together:

1. **What an i18n key is called** — a stable, namespaced identifier (e.g. `common.submit`).
2. **Where it appears** — a region drawn directly on a real UI screenshot.
3. **What it says** — the source text, plus the translations that come back from your TMS.

A **Page** is a UI screenshot uploaded to a project. On that screenshot you draw **Tags** —
rectangles around real UI elements. Each tag carries an **i18n key**, and the key holds one
text value per configured locale. Everything else serves that binding:

- **For designers** — capture a Figma frame as a page with the Figma plugin, or upload a
  screenshot and pick strings with OCR; every string keeps its visual context. Preview
  translations back in Figma to spot text that no longer fits.
- **Key governance** — AI-assisted naming, naming rules, duplicate and consistency checks,
  release labels.
- **Hand-off** — Git sync pushes source text to the repository your TMS watches and pulls
  translations back, with preview, three-way merge, and conflict cards.
- **For developers** — export to XLSX/JSON, a token-protected delivery API, and an MCP server
  for AI coding agents.

### What it is not

- **Not a TMS.** No translator workbench, task assignment, review workflow, translation
  memory, or per-word billing. Those belong to your TMS; Localness integrates with it instead
  of replacing it.
- **Not a headless CMS.** It models pages, tags, keys, locales, and releases — nothing else.
- **Not a screenshot gallery.** A screenshot without tags and keys is only a starting point.

### Draft vs. Published

Every text value has two layers. Editing writes to a **draft**; an explicit publish action
snapshots the draft into the **published** layer, which is what exports, the delivery API,
and MCP tools read. You can keep editing drafts without changing what consumers already see.

## Features

- 📸 **Screenshot-first workflow** — upload UI screenshots as Pages and annotate them in a
  canvas editor built on [Leafer UI](https://www.leaferjs.com/): draw, resize, move, lock,
  and reorder tags with undo/redo support.
- 🖌️ **Figma plugin** (`localness-plugin`) — **Capture** turns a Figma
  frame into a page: its screenshot, one tag per text layer, and the source text, matched to
  existing keys. **Preview** lays out published translations next to your frames and flags
  layers that may overflow. Connects through the delivery API with a personal access token;
  the instance must be served over HTTPS.
- 🔤 **OCR assist** — recognize text inside a tag region ([OCR.Space](https://ocr.space/) API)
  and prefill the source text.
- 🤖 **AI-assisted key naming** — suggest i18n key names from the tag's context via any
  OpenAI-compatible endpoint, with per-feature configuration overrides.
- 🌐 **Key table** — a key × locale matrix with autosave, per-locale publish, version
  history, batch paste-import, and references back to the tags using a key.
- 🧹 **Consistency checks** (Plus) — scan a project for duplicate source text under different
  keys, translations whose placeholders, numbers, or tags no longer match the source, style
  issues, and orphan keys; fix them from a review drawer.
- 🏷️ **Releases** — version-like labels (e.g. `v1.3`, `sprint-12`) assigned to keys for
  filtering across the translations table, export, and the delivery API.
- 📦 **Export** — download XLSX (including a painted preview sheet of tags on the source
  screenshots) or JSON (flat, or structured for your i18n framework).
- 🔁 **Git Sync (TMS hand-off)** — push source text to the Git repository your TMS reads,
  and pull translations back, with preview, three-way merge, and UI-based conflict
  resolution. Ships with a LILT batch layout and a generic "one JSON per locale" layout;
  more layouts can be added as adapters (see
  [`server/libs/git-sync/README.md`](server/libs/git-sync/README.md)).
- 👥 **Teams & permissions** — teams with invite codes, owner/editor/viewer roles, and
  per-project owners.
- 🔌 **Delivery API & MCP** — a `v1` API (`projects` / `meta` / `locales/:locale` / `bundle`,
  plus a write surface a design tool imports frames through) protected by personal access
  tokens, plus an MCP server so AI coding agents can query keys directly.
- 🧩 **Skills** — attach project knowledge packages that AI agents consume through the API/MCP.
- 🔔 **Notifications** — in-app notifications for team invitations and collaboration events.
- 🔐 **Authentication** — local username/password accounts (scrypt-hashed), with optional
  Atlassian OAuth restricted by an email-domain allowlist.
- 🗄️ **Pluggable image storage** — keep uploaded screenshots on a local volume, or use
  Qiniu Cloud OSS.
- 🌙 **Dark-first UI** — built with Nuxt UI and Tailwind CSS 4.

## Tech Stack

| Layer      | Technology                                                             |
| ---------- | ---------------------------------------------------------------------- |
| Framework  | Nuxt 4 (Vue 3, TypeScript) + Nitro server                              |
| UI         | Nuxt UI, Tailwind CSS 4, motion-v, Leafer UI canvas                    |
| State      | Pinia                                                                  |
| Database   | SQLite via Prisma 7 + better-sqlite3                                   |
| Auth       | nuxt-auth-utils (session + scrypt), optional Atlassian OAuth 2.0 (3LO) |
| Validation | zod (shared schemas between client and server)                         |
| Tests      | Vitest (unit + API)                                                    |
| Packaging  | pnpm workspaces, Docker (single container + one volume)                |

## Project Structure

```text
app/                  Nuxt application (pages, components, composables, stores, editor core)
server/               Nitro backend
  api/                REST endpoints (pages, tags, translations, teams, projects, v1 delivery)
  routes/             Auth routes, file upload, MCP endpoint
  helper/             Access control, tokens, i18n, releases, git-sync helpers
  libs/               Prisma client, OCR, AI agents, git-sync engine, storage drivers
shared/               Types, constants, zod schemas and utils shared by app and server
prisma/               SQLite schema and migrations
test/                 Vitest unit tests and API tests
docker/               Docker entrypoint and deployment guide
docs/run-book/        Full product manual (Chinese)
runtime/              Data directory: SQLite database and local uploads
```

## Getting Started (local development)

**Prerequisites:** Node.js ≥ 22 (see `package.json` `engines`) and pnpm 10
(`corepack enable && corepack install`).

```bash
# Install dependencies
pnpm install

# Prepare the database (SQLite file under runtime/db)
pnpm exec prisma generate
pnpm exec prisma migrate deploy

# Start the dev server on http://localhost:3000
pnpm dev
```

There is **no public signup** — the first user and every later user are created from the CLI:

```bash
pnpm register
```

## Scripts

| Command            | Description                                         |
| ------------------ | --------------------------------------------------- |
| `pnpm dev`       | Start the Nuxt dev server                           |
| `pnpm build`     | Production build                                    |
| `pnpm preview`   | Preview the production build locally                |
| `pnpm lint`      | ESLint check                                        |
| `pnpm typecheck` | `nuxi typecheck` (vue-tsc)                        |
| `pnpm test`      | Run unit + API tests (Vitest)                       |
| `pnpm test:unit` | Unit tests only                                     |
| `pnpm test:api`  | API tests (boots a full Nuxt instance on `:4000`) |
| `pnpm register`  | Create a user account from the CLI                  |

CI (GitHub Actions) gates on `pnpm test` and `pnpm typecheck`.

## Deployment (Docker)

Docker is the only supported deployment path: a single container plus one volume
(`/app/runtime`), which holds the SQLite database and — with the `LOCAL` storage engine —
the uploaded screenshots. **Losing the volume loses the data.**

```bash
# Next to docker-compose.yml:
cp .env.docker.example .env.docker
# edit .env.docker — NUXT_SESSION_PASSWORD (32+ chars) is mandatory

docker compose pull
docker compose up -d
docker compose logs -f localness     # migrations run before the server starts

# Create the first account
docker compose exec localness tsx scripts/register.ts
```

- The entrypoint runs `prisma migrate deploy` on every boot (idempotent).
- Health check: `curl localhost:13000/api/health` → `{"ok":true,"db":true,...}`.
- Pin a release instead of `latest`:
  `LOCALNESS_IMAGE=huacc/localness:1.2.0 docker compose up -d`
- Images are published to Docker Hub (`huacc/localness`) by pushing a semver git tag.

The full deployment guide — upgrades via `update.sh`, backup/restore, AI prompt mounts,
Atlassian OAuth setup — lives in [`docker/README.md`](docker/README.md).

## Configuration

All configuration is environment-based; in Docker it comes from `.env.docker`
(never baked into the image). Highlights (full list in
[`.env.docker.example`](.env.docker.example)):

| Variable                                           | Purpose                                                           |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| `NUXT_SESSION_PASSWORD`                          | **Required.** Session sealing secret, 32+ chars             |
| `NUXT_SALT_SIZE`                                 | scrypt salt size — also a build arg; do not change after go-live |
| `DATABASE_URL`                                   | SQLite file URL (default `file:/app/runtime/db/localness.db`)   |
| `PORT`                                           | Listen port (default `13000`)                                   |
| `NUXT_PUBLIC_OSS_ENGINE`                         | `LOCAL` or `QINIU` screenshot storage                         |
| `NUXT_PUBLIC_OSS_BASE_URL`                       | Public base URL for images (`/upload/` for LOCAL)               |
| `NUXT_QINIU_*`                                   | Qiniu OSS credentials, bucket and domain                          |
| `NUXT_OPENAI_API_KEY` / `BASE_URL` / `MODEL` | Shared OpenAI-compatible endpoint for AI features                 |
| `NUXT_OPENAI_I18N_KEY_*`                         | Per-feature overrides for the key-naming AI                       |
| `NUXT_OCR_API_KEY` / `NUXT_OCR_API_URL`        | OCR.Space configuration                                           |
| `NUXT_OAUTH_ATLASSIAN_*`                         | Optional Atlassian OAuth client                                   |
| `NUXT_ATLASSIAN_ALLOWED_EMAIL_DOMAINS`           | Email-domain allowlist — empty means deny everyone               |

## API & MCP for Consumers

Published translations are delivered read-only, protected by personal access tokens. A token
names the projects it may reach, and its reach is re-checked against the owner's team
memberships on every request, so it stops working when they leave the team:

- `GET /api/v1/projects` — which projects this token can address
- `GET /api/v1/meta` — project metadata, locales, releases
- `GET /api/v1/locales/:locale` — all published keys for one locale
- `GET /api/v1/bundle` — the full published bundle

When a token reaches exactly one project, its requests name none — which is every token minted
before tokens became personal, so nothing about those callers changed.

An MCP endpoint (`/mcp?project=<id-or-name>`) exposes the same data to AI coding agents. See
[`docs/run-book/12-api-mcp.md`](docs/run-book/12-api-mcp.md) (Chinese) for details.

## Documentation

- [`docker/README.md`](docker/README.md) — deployment, upgrades, backup, OAuth, AI prompts (English)
- Figma plugin (`localness-plugin`) — install, connect, Capture, Preview; its docs ship with the plugin, which is not public yet
- [`docs/run-book/`](docs/run-book/00-menu.md) — full product manual: teams, projects,
  releases, editor, translations, export, Git sync, API/MCP, skills, permissions (Chinese)

## License

**[Elastic License 2.0](LICENSE)** — source-available. Not an OSI-approved open-source
license.

Copyright (c) 2026 CHUANCHENG HUA ([@Hwacc](https://github.com/Hwacc)).

You **may**, free of charge:

- run Localness yourself, personally or inside your company, in production included;
- read, modify, and build the source;
- redistribute it, so long as whoever receives it also receives the license terms.

You **may not**:

- provide Localness to third parties as a hosted or managed service — i.e. resell it
  as a SaaS;
- move, change, disable, or circumvent license-key functionality, or remove anything
  a license key protects;
- strip or obscure the licensing and copyright notices.

If you modify the source, your copies must say so prominently. The summary above is
not a substitute for [`LICENSE`](LICENSE), which is the binding text.

A commercial license lifting these limitations is available. For that, or for any
other licensing question, contact **mshcccch@gmail.com** or open an issue.
