# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (repo root)

```bash
npm run dev          # Dev server: tsx watch src/server.ts (port 3000)
npm run build        # Compile TypeScript -> dist/
npm start            # Run production build (node dist/server.js)

npm test             # Run all tests once (vitest run)
npm run test:watch   # Watch mode
npx vitest run tests/assets.test.ts          # Run a single test file
npx vitest run -t "creates an asset"          # Run tests matching a name

npm run seed         # Seed sample assets into a running API (idempotent; API_BASE overridable)
```

### Admin frontend (`admin/`)

Separate React + Vite SPA (React Three Fiber viewer, TanStack Query, Tailwind). It is **not** part of the backend build.

```bash
cd admin
npm run dev          # Vite dev server (proxies API to backend)
npm run build        # tsc -b && vite build
npm run lint         # eslint
```

### Local infrastructure

```bash
docker compose -f docker/docker-compose.yml up        # Postgres, Redis, MinIO (+ mc bucket init)
scripts/docker-up.sh / docker-down.sh / docker-reset.sh / docker-logs.sh   # Helper wrappers
docker compose -f docker/docker-compose.manyfold.yml up   # Optional: local Manyfold instance for integration testing
```

`docker/docker-compose.dev.yml` / `.override.yml` build the backend + admin in containers (Blender, Puppeteer support).

## Architecture

Headless DAM (Digital Asset Management) for 3D assets, focused on e-commerce delivery. **GLB is the master format; USDZ, thumbnails, LODs, and compressed variants are derived artifacts.**

### Core Stack

- **Runtime**: Node.js, ES2022 ESM (`"type": "module"`)
- **Web framework**: Fastify v4
- **Language**: TypeScript v5 (strict), `moduleResolution: Bundler`
- **GraphQL**: Mercurius, mounted at `/graphql` with GraphiQL enabled
- **Queues**: BullMQ + Redis (ioredis) for background workers
- **Storage**: AWS S3 SDK targeting MinIO locally
- **3D processing**: glTF-Transform (+ Draco, KTX2, meshoptimizer), Puppeteer for thumbnail rendering
- **Auth**: JWT (`jsonwebtoken`) + bcrypt, API-key scopes

### Entry point & app composition

`src/server.ts` simply boots `createApp()` from **`src/app.ts`**. `app.ts` is a ~1650-line monolith that wires up the store, all services, the GraphQL plugin, and most REST routes inline. **Newer feature areas are extracted into `src/routes/*.routes.ts`** and registered near the bottom of `app.ts` (`registerAuthRoutes`, `registerAssetTypesRoutes`, `registerWorkflowRoutes`, `registerExportRoutes`, `registerAnalyticsRoutes`, `registerManyfoldRoutes`). When adding endpoints, prefer a new `*.routes.ts` module over growing `app.ts`.

### Storage abstraction (important)

The data store is swapped at runtime based on env, behind a single `Store` interface defined in `app.ts`:

- **No `DATABASE_URL`** → `MemoryStore` (`src/store.ts`), wrapped by `createAsyncStore()` to satisfy the async interface. This is the default and what most tests run against.
- **`DATABASE_URL` set** → `PgStore` (`src/services/pg-store.ts`), using **`pg` directly** (raw SQL via `src/db.ts` pool helpers).

There is a `prisma/schema.prisma`, but **Prisma is not used at runtime** — it documents the intended Postgres schema for `PgStore`. Do not assume a Prisma client is available.

### Service & model layout

- **Models split across two locations**: core entities (`Asset3D`, `LightingPreset`, `RenderPreset`, `MaterialVariant`, plus `RenderManifest`) live in the single file **`src/models.ts`**; feature-specific models live in **`src/models/*.ts`** (`auth`, `tags`, `custom-fields`, `workflow`, `export`, `analytics`).
- **Services** in `src/services/` are constructed via factory functions — either `createX()` (new instance) or `getX()` (singleton). Match the existing pattern when adding one.
- **Workers** in `src/workers/` (`ktx-compression`, `lod-generation`) are BullMQ processors for the heavy 3D jobs.

### Feature areas (roughly versioned V0→V6 by commit history)

Asset CRUD & presigned uploads · lighting/render/material presets · render manifests for the viewer · Draco compression · KTX2 texture compression · LOD generation · USDZ conversion (iOS AR) · Puppeteer thumbnail rendering · asset versioning · batch operations · webhooks & system events · search (incl. spatial/similar) · tags/categories/collections · custom fields · workflow lifecycle · exports · analytics · **Manyfold integration (V6)**.

### Manyfold integration

`src/services/manyfold-sync.service.ts` + `src/routes/manyfold.routes.ts` (prefix `/manyfold`) bridge to a self-hosted [Manyfold](https://manyfold.app) instance via its JSON-LD REST API (v0): OAuth2 client-credentials auth, import models → `Asset3D`, export assets via Tus upload, and ID-mapped bidirectional sync. Configured via `MANYFOLD_BASE_URL` / `MANYFOLD_CLIENT_ID` / `MANYFOLD_CLIENT_SECRET`.

### Module conventions

ES module imports **must** use the `.js` suffix even for `.ts` sources:
```typescript
import { Asset3D } from './models.js';
import { getAuthService } from './services/auth.service.js';
```

### Environment variables

See `.env.example` for the full list. Key ones:
- `PORT` (3000), `HOST` (0.0.0.0)
- `DATABASE_URL` — presence switches `MemoryStore` → `PgStore`
- `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` — BullMQ
- `S3_ENDPOINT` / `S3_BUCKET` / `S3_PUBLIC_ENDPOINT` / `AWS_*` — MinIO/S3; `STORAGE_BASE_URL` is the stub fallback
- `USE_REAL_SERVICES` — `false` uses in-memory stubs for S3/Redis
- `MANYFOLD_*` — Manyfold integration

### Testing

Vitest (`globals: true`, node env). 28 test files in `tests/`, mostly exercising `createApp()` with the in-memory store over HTTP (supertest). `tests/fixtures/` holds sample GLBs; some tests (`poltrona-*`) run the real 3D pipeline and write to `tests/thumbnails-output/`.

### Dev/processing scripts

`scripts/` mixes shell infra helpers (`docker-*.sh`, `infra.sh`, `backup.sh`, `restore.sh`) and TypeScript pipeline runners (`generate-lods.ts`, `process-poltrona.ts`, `poltrona-v3-complete.ts`, `pipeline-ecommerce.ts`) — run the latter with `tsx`.
