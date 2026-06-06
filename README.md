# SimpleXR Headless CMS 3D

Headless DAM (Digital Asset Management) for 3D assets, focused on e-commerce delivery. **GLB is the master format; USDZ, thumbnails, LODs, and compressed variants are derived artifacts.**

Built with Fastify + TypeScript (ESM), with a GraphQL API, BullMQ background workers for heavy 3D processing, and a React admin SPA with a live 3D viewer.

## Quick start

```bash
npm install
npm run dev          # API on http://localhost:3000 (tsx watch)
```

With no `DATABASE_URL` set, the server runs against an in-memory store — no infrastructure required to start.

### Admin UI

```bash
cd admin
npm install
npm run dev          # Vite dev server, proxies to the API
```

### Local infrastructure (Postgres, Redis, MinIO)

```bash
docker compose -f docker/docker-compose.yml up
```

Setting `DATABASE_URL` switches the API from the in-memory store to PostgreSQL.

## Scripts

```bash
npm run dev          # Dev server with watch
npm run build        # Compile TypeScript -> dist/
npm start            # Run the production build
npm test             # Run the test suite once (Vitest)
npm run test:watch   # Watch mode

npx vitest run tests/assets.test.ts   # Run a single test file
```

## Architecture

- **Entry point**: `src/server.ts` boots `createApp()` from `src/app.ts`, which wires the store, services, GraphQL plugin, and REST routes. Feature areas are progressively extracted into `src/routes/*.routes.ts`.
- **Storage abstraction**: a single `Store` interface backed by either `MemoryStore` (default) or `PgStore` (raw `pg`/SQL), selected at runtime by the presence of `DATABASE_URL`.
- **3D pipeline**: glTF-Transform (Draco, KTX2, meshoptimizer) for optimization, Puppeteer for thumbnail rendering, and a USDZ converter for iOS AR Quick Look. Heavy jobs run as BullMQ workers (`src/workers/`).
- **APIs**: REST (Fastify) plus a GraphQL endpoint at `/graphql` (GraphiQL enabled). Auth uses JWT + bcrypt with API-key scopes.

See [`CLAUDE.md`](./CLAUDE.md) for a fuller breakdown of the codebase layout and conventions.

## Key endpoints

**Assets & uploads**
- `POST /assets` — create an Asset3D
- `GET /assets/:id` — get an asset
- `PATCH /assets/:id` / `DELETE /assets/:id`
- `POST /uploads/presign` — presigned upload URL

**Viewer delivery**
- `GET /viewer/assets/:assetId` — delivery asset info
- `GET /viewer/assets/:assetId/render?preset=:presetId&device=mobile` — render manifest
- `GET /viewer/presets?tag=studio` — list lighting presets

**Processing**
- `POST /assets/:id/draco/compress`, `POST /assets/:id/ktx2/compress`
- `POST /assets/:id/lods/generate`, `POST /assets/:id/usdz`, `POST /assets/:id/thumbnails`

**Other areas**
- Search (`/search`, incl. spatial/similar), tags/categories/collections, custom fields, workflow, exports, analytics, webhooks/events, asset versioning
- GraphQL: `POST /graphql` (interactive GraphiQL at `/graphql`)

## Integrations

**Manyfold** — optional bidirectional sync with a self-hosted [Manyfold](https://manyfold.app) instance via routes under `/manyfold`. Configure `MANYFOLD_BASE_URL`, `MANYFOLD_CLIENT_ID`, `MANYFOLD_CLIENT_SECRET`. A local instance for testing is available via `docker compose -f docker/docker-compose.manyfold.yml up`.

## Configuration

Copy `.env.example` to `.env`. Notable variables:

- `PORT` (3000), `HOST` (0.0.0.0)
- `DATABASE_URL` — when set, uses PostgreSQL instead of the in-memory store
- `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` — BullMQ queues
- `S3_ENDPOINT` / `S3_BUCKET` / `S3_PUBLIC_ENDPOINT` / `AWS_*` — MinIO/S3 storage
- `USE_REAL_SERVICES` — set `false` to use in-memory stubs for S3/Redis
- `MANYFOLD_*` — Manyfold integration

## Notes

- GLB is the master; USDZ and thumbnails are derived artifacts.
- The in-memory store and stubbed services let the API run with zero external dependencies for development and tests.
