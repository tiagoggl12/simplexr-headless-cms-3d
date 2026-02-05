# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SimpleXR Headless 3D DAM** - A headless Digital Asset Management system for 3D assets focused on e-commerce delivery. GLB files are the master format; USDZ and thumbnails are derived artifacts.

## Commands

```bash
# Backend Development
npm run dev              # Start backend with tsx watch (port 3000)
npm run build            # Compile TypeScript to dist/
npm start                # Run production build

# Frontend Development (admin UI)
cd admin && npm run dev  # Start Vite dev server (port 5173)
cd admin && npm run build # Build admin frontend

# Testing
npm test                 # Run all tests once (Vitest)
npm run test:watch       # Run tests in watch mode

# Local Infrastructure
docker compose -f docker/docker-compose.yml up    # PostgreSQL, Redis, MinIO
```

## Project Structure

```
simplexr-headless-cms-3d/
├── src/                          # Backend TypeScript source
│   ├── app.ts                    # Fastify app + route definitions
│   ├── server.ts                 # Server entry point
│   ├── models.ts                 # TypeScript interfaces
│   ├── store.ts                  # MemoryStore (in-memory persistence)
│   └── services/
│       ├── storage.ts            # LocalStorageService (stubbed)
│       ├── s3-storage.ts         # S3StorageService (AWS/MinIO)
│       ├── queue.ts              # InMemoryQueue (stubbed)
│       ├── redis-queue.ts        # RedisQueueService (BullMQ)
│       └── processing.ts         # ProcessingService (GLB validation)
├── admin/                        # React admin frontend
│   ├── src/
│   │   ├── App.tsx               # React Router setup
│   │   ├── pages/                # Dashboard, Assets, Lighting, Renders, Uploads
│   │   ├── components/           # Layout, UI components, ModelViewer
│   │   └── lib/                  # api.ts, store.ts (Zustand), types.ts
│   ├── vite.config.ts            # Vite config with API proxy
│   └── tailwind.config.js        # Tailwind customization
├── tests/                        # Vitest test files
│   ├── integration.test.ts       # Full API integration tests (27+ tests)
│   ├── assets.test.ts            # Asset CRUD tests
│   ├── services.test.ts          # Service unit tests
│   └── uploads.test.ts           # Upload endpoint tests
├── docker/
│   └── docker-compose.yml        # PostgreSQL, Redis, MinIO
├── prisma/
│   └── schema.prisma             # Future PostgreSQL schema
└── public/                       # Static test UI files
```

## Architecture

### Core Concepts

**GLB Master Pipeline**: All 3D assets use GLB as the source of truth. The processing pipeline generates:
- USDZ for iOS AR Quick Look
- Thumbnail renders per lighting preset
- Optimized viewer assets

**Render Manifests**: The `/viewer/assets/:assetId/render` endpoint returns a RenderManifest that resolves the complete viewer configuration (asset, lighting, camera, quality profile) in a single request.

### Data Models (`src/models.ts`)

```typescript
Asset3D {
  id, name, masterUrl
  status: 'draft' | 'processing' | 'ready' | 'failed'
  createdAt, updatedAt
}

LightingPreset {
  id, name, hdriUrl, exposure, intensity
  tags: string[]  // 'studio', 'outdoor', etc.
}

RenderPreset {
  id, assetId, lightingPresetId
  camera: { fov, position: [x,y,z], target: [x,y,z] }
}

RenderManifest {
  version: 'v1'
  asset: { id, masterUrl }
  lighting: LightingPreset
  camera, qualityProfile: 'desktop' | 'mobile'
}
```

### Service Layer

| Service | File | Purpose |
|---------|------|---------|
| `MemoryStore` | `store.ts` | In-memory persistence with Map storage |
| `LocalStorageService` | `services/storage.ts` | Stubbed presigned URLs |
| `S3StorageService` | `services/s3-storage.ts` | Real AWS SDK / MinIO integration |
| `InMemoryQueue` | `services/queue.ts` | Stubbed job queue |
| `RedisQueueService` | `services/redis-queue.ts` | BullMQ Redis job queue |
| `ProcessingService` | `services/processing.ts` | GLB validation, optimization |

Toggle real services via `USE_REAL_SERVICES=true` environment variable.

## API Endpoints

### Asset Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/assets` | Create asset (returns 201) |
| GET | `/assets/:id` | Get single asset |
| GET | `/assets` | List assets (?status=ready&limit=10&offset=0) |
| PATCH | `/assets/:id` | Update asset (name, status) |
| DELETE | `/assets/:id` | Delete asset (returns 204) |

### Lighting Presets
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/presets/lighting` | Create lighting preset |
| GET | `/presets/lighting` | List presets (?tag=studio) |
| PATCH | `/presets/lighting/:id` | Update preset |
| DELETE | `/presets/lighting/:id` | Delete preset |

### Render Presets
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/presets/render` | Create render preset |
| GET | `/presets/render` | List presets (?assetId=xxx) |
| DELETE | `/presets/render/:id` | Delete preset |

### Upload & Viewer
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/uploads/presign` | Get presigned upload URL |
| GET | `/viewer/assets/:assetId` | Asset info for viewer |
| GET | `/viewer/assets/:assetId/render` | Render manifest (?preset=id&device=mobile) |
| GET | `/viewer/presets` | List lighting presets (?tag=studio) |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Returns `{ status: 'ok', timestamp }` |

## Testing

Tests use **Vitest** with Fastify's `app.inject()` for HTTP testing.

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
```

**Test patterns:**
- Integration tests: `tests/integration.test.ts` (27+ tests covering full API)
- Use `app.inject({ method, url, payload })` for endpoint testing
- Sample fixtures defined inline
- Tests verify status codes, response shapes, data integrity

## Environment Variables

```bash
# Server
PORT=3000
HOST=0.0.0.0

# Feature toggle
USE_REAL_SERVICES=false    # Set true to use S3/Redis

# S3/MinIO (when USE_REAL_SERVICES=true)
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=dam-assets
S3_PUBLIC_ENDPOINT=http://localhost:9000
AWS_ACCESS_KEY_ID=minio
AWS_SECRET_ACCESS_KEY=minio123
AWS_REGION=us-east-1

# Redis (when USE_REAL_SERVICES=true)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Database (future)
DATABASE_URL=postgresql://dam:dam@localhost:5432/dam
```

## Code Conventions

### Module System
- ES2022 modules with `.js` extensions in imports
- Example: `import { MemoryStore } from './store.js'`

### Request Validation
- Use **Zod schemas** for all request validation
- Schemas defined inline in `app.ts`

### API Response Patterns
- POST creation: 201 status
- DELETE: 204 status (no body)
- Errors: `{ error: 'error_code' }` format
- Pagination: `{ items, total, offset, limit }`

### Frontend Conventions (admin/)
- **React 18** with **TypeScript**
- **React Router v7** for navigation
- **TanStack Query** for data fetching (staleTime: 5000ms)
- **Zustand** for state management (with localStorage persistence)
- **Tailwind CSS** for styling
- **React Hook Form + Zod** for form validation
- **Three.js + React Three Fiber** for 3D model viewing

### TypeScript
- Strict mode enabled
- All interfaces in `src/models.ts` (backend) and `admin/src/lib/types.ts` (frontend)

## Docker Services

```yaml
# docker/docker-compose.yml
services:
  postgres:   # Port 5432, user: dam, password: dam
  redis:      # Port 6379
  minio:      # Port 9000 (API), 9001 (Console), user: minio/minio123
```

## Dependencies

### Backend Key Packages
- `fastify` - HTTP framework
- `@aws-sdk/client-s3` - S3/MinIO integration
- `bullmq` + `ioredis` - Redis job queue
- `@gltf-transform/core` - GLB validation/optimization
- `zod` - Schema validation
- `uuid` - ID generation
- `pino` - Logging

### Frontend Key Packages
- `react`, `react-router-dom` - UI/routing
- `@tanstack/react-query` - Data fetching
- `zustand` - State management
- `three`, `@react-three/fiber`, `@react-three/drei` - 3D rendering
- `tailwindcss` - Styling
- `react-hook-form`, `zod` - Forms/validation

## V0 Status

**Implemented:**
- Full CRUD API for assets, lighting presets, render presets
- Real S3/MinIO storage service
- Real Redis/BullMQ job queue
- GLB validation with glTF-Transform
- Admin React frontend with 7 pages
- 27+ integration tests passing

**Not Yet Implemented:**
- PostgreSQL integration (Prisma schema ready, using in-memory store)
- Material variants (planned V1)
- KTX2/BasisU texture compression
- Thumbnail generation execution
- Authentication/authorization
- OpenAPI documentation
