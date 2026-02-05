# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev          # Start dev server with tsx watch (port 3000)

# Build
npm run build        # Compile TypeScript to dist/
npm start            # Run production build

# Testing
npm test             # Run tests once
npm run test:watch   # Run tests in watch mode

# Local services
docker compose -f docker/docker-compose.yml up    # PostgreSQL, Redis, MinIO
```

## Architecture

This is a headless DAM (Digital Asset Management) for 3D assets, focused on e-commerce delivery. GLB files are the master format; USDZ and thumbnails are derived artifacts.

### Core Concepts

**GLB Master Pipeline**: All 3D assets use GLB as the source of truth. The processing pipeline (Blender + glTF-Transform) generates:
- USDZ for iOS AR Quick Look
- Thumbnail renders per lighting preset
- Optimized viewer assets

**Render Manifests**: The `/viewer/assets/:assetId/render` endpoint returns a RenderManifest that resolves the complete viewer configuration (asset, lighting, camera, quality profile) in a single request.

### Data Model

Core entities in `src/models.ts`:
- `Asset3D`: master GLB URL, status (draft/processing/ready/failed), timestamps
- `LightingPreset`: HDRI URL with exposure/intensity, tags for filtering
- `RenderPreset`: combines asset + lighting preset + camera configuration
- `RenderManifest`: resolved config for viewer consumption (versioned schema)

### Service Layer

`src/services/storage.ts` - `LocalStorageService`: Stubbed presigned URL generation. In production this integrates with S3/MinIO.

`src/services/queue.ts` - `InMemoryQueue`: Stubbed job queue for async processing (normalize, optimize, convert, thumbnail).

`src/store.ts` - `MemoryStore`: In-memory persistence. V0 uses maps; planned replacement with PostgreSQL.

### API Endpoints

Asset Management:
- `POST /assets` - Create Asset3D
- `GET /assets/:id` - Get asset details

Upload:
- `POST /uploads/presign` - Get presigned URL for upload

Viewer Delivery:
- `GET /viewer/assets/:assetId` - Asset info for viewer
- `GET /viewer/assets/:assetId/render?preset=:presetId&device=mobile` - Render manifest
- `GET /viewer/presets?tag=studio` - List lighting presets

Configuration:
- `POST /presets/lighting` - Create lighting preset
- `POST /presets/render` - Create render preset (asset + lighting + camera)

### Module System

Uses ES2022 modules with `.js` extensions in import statements (TypeScript emits to this format). All imports must include `/` suffix for directory imports: `import { foo } from './bar.js'`.

### Environment Variables

- `PORT` - Server port (default: 3000)
- `HOST` - Bind address (default: 0.0.0.0)
- `STORAGE_BASE_URL` - Storage base URL for presigned URLs (default: s3://bucket)

## V0 Scope Notes

- Storage and queue are stubbed (no actual S3/Redis integration)
- No test coverage yet (tests directory pending)
- No material variant support yet (planned V1)
- Processing pipeline is recorded but not executed
