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

This is a headless DAM (Digital Asset Management) for 3D assets focused on e-commerce delivery. GLB files are the master format; USDZ and thumbnails are derived artifacts.

### Core Stack

- **Runtime**: Node.js (ES2022 modules)
- **Web Framework**: Fastify (v4.26.2)
- **Language**: TypeScript (v5.5.4) with strict type checking
- **Database**: PostgreSQL via Prisma ORM (MemoryStore for development)
- **Queue System**: BullMQ with Redis for background jobs
- **Storage**: AWS S3 SDK with MinIO for local development
- **3D Processing**: glTF-Transform for GLB manipulation, Draco compression, KTX2 textures

### Key Features

**GLB Master Pipeline**: All 3D assets use GLB as the source of truth. The processing pipeline generates:
- USDZ for iOS AR Quick Look
- Thumbnail renders per lighting preset
- Optimized viewer assets with Draco/KTX2 compression

**Advanced Capabilities**:
- **Material Variants**: PBR-based material customization
- **Level of Detail (LOD)**: Automatic LOD generation for performance
- **Custom Fields**: Flexible metadata system with JSON schemas
- **Workflow System**: Asset lifecycle management with events
- **Analytics**: Asset views, downloads, sharing metrics
- **Export System**: Multi-format export capabilities

### Data Model

Core entities in `src/models/`:
- `Asset3D`: master GLB URL, status, timestamps, variants
- `LightingPreset`: HDRI URL with exposure/intensity, tags
- `MaterialVariant`: PBR material configurations with textures
- `RenderPreset`: combines asset + lighting preset + camera
- `CustomField`: JSON schema for dynamic metadata
- `WorkflowEvent`: Asset lifecycle events
- `ExportJob`: Background export processing

### Service Architecture (23 services)

**Core Services**:
- `StorageService`: Abstract storage interface (S3/MinIO)
- `CDNService`: Content delivery network integration
- `RenderManifestService`: Dynamic viewer configuration

**3D Processing**:
- `DracoCompressionService`: Mesh optimization
- `KTX2ProcessorService`: Texture compression
- `LODGeneratorService`: Level of detail generation
- `USDZConverterService`: iOS AR format conversion

**Business Logic**:
- `AssetVersioningService`: Asset version management
- `BatchOperationsService`: Bulk processing
- `WebhookService`: External integrations
- `AnalyticsService`: Metrics and tracking

### API Design

Versioned API endpoints (V0-V5) with comprehensive CRUD operations:

**Asset Management**:
- `POST /assets` - Create Asset3D
- `GET /assets/:id` - Get asset details
- `PATCH /assets/:id` - Update asset
- `DELETE /assets/:id` - Delete asset

**Upload System**:
- `POST /uploads/presign` - Get presigned URL
- `POST /uploads/complete` - Mark upload complete

**Viewer Delivery**:
- `GET /viewer/assets/:assetId` - Asset info
- `GET /viewer/assets/:assetId/render` - Render manifest
- `GET /viewer/presets` - List lighting presets
- `GET /viewer/materials` - List material variants

**Advanced Features**:
- `POST /analytics/events` - Track usage
- `POST /webhooks` - Event subscriptions
- `POST /exports` - Create export jobs
- `POST /custom-fields` - Define metadata schemas

### Module System

ES2022 modules with explicit `/` suffix imports:
```typescript
import { Asset3D } from './models/asset.js'
import { StorageService } from './services/storage.js'
```

### Testing

Vitest-based test suite covering:
- Asset CRUD operations
- 3D processing features
- Authentication and authorization
- Analytics and metrics
- Custom field functionality
- Workflow and events

### Environment Variables

- `PORT` - Server port (default: 3000)
- `HOST` - Bind address (default: 0.0.0.0)
- `STORAGE_BASE_URL` - Storage base URL
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string

### Scripts for Development

Utility scripts in `scripts/`:
- `generate-lods.ts` - Generate Level of Detail for models
- `poltrona-v3-complete.ts` - Complete processing workflow
- `process-poltrona.ts` - Asset processing pipeline
