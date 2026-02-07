import Fastify from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { MemoryStore } from './store.js';
import { PgStore } from './services/pg-store.js';
import { LocalStorageService } from './services/storage.js';
import { RenderManifestService, type Store as ManifestStore } from './services/render-manifest.js';
import { Asset3D, AssetStatus, LightingPreset, RenderPreset, MaterialVariant } from './models.js';
import { createKTX2Processor } from './services/ktx-processor.js';
import { createLODGenerator } from './services/lod-generator.js';
import { createCDNService } from './services/cdn-service.js';
import { createDracoCompressor } from './services/draco-compression.js';
import { createAssetVersioningService, type AssetVersion } from './services/asset-versioning.js';
import { createBatchOperationsService, type BatchOperation } from './services/batch-operations.js';
import { createWebhooksEventsService, type SystemEvent, type Webhook } from './services/webhooks-events.js';

// V4 Services
import { getAuthService } from './services/auth.service.js';
import { registerAuthRoutes } from './middleware/auth.js';
import { getUSDZConverter } from './services/usdz-converter.js';
import { getThumbnailGenerator } from './services/thumbnail-generator.js';
import { createSearchService } from './services/search.service.js';
import { createTagsService } from './services/tags.service.js';
import type { Tag, Category, Collection } from './models/tags.js';

// V5 Services
import { getCustomFieldsService } from './services/custom-fields.service.js';
import { getWorkflowService } from './services/workflow.service.js';
import { getExportService } from './services/export.service.js';
import { getAnalyticsService } from './services/analytics.service.js';

// V5 Routes
import { registerAssetTypesRoutes } from './routes/asset-types.routes.js';
import { registerWorkflowRoutes } from './routes/workflow.routes.js';
import { registerExportRoutes } from './routes/exports.routes.js';
import { registerAnalyticsRoutes } from './routes/analytics.routes.js';

/**
 * Store interface for type-safe store usage
 * Both MemoryStore and PgStore implement these methods
 */
interface Store {
  createAsset(asset: Asset3D): Promise<Asset3D>;
  getAsset(id: string): Promise<Asset3D | null>;
  listAssets(options?: ListOptions): Promise<{ items: Asset3D[]; total: number; offset: number; limit: number }>;
  updateAsset(id: string, updates: Partial<Omit<Asset3D, 'id' | 'createdAt'>>): Promise<Asset3D | null>;
  deleteAsset(id: string): Promise<boolean>;
  createLightingPreset(preset: LightingPreset): Promise<LightingPreset>;
  getLightingPreset(id: string): Promise<LightingPreset | null>;
  listLightingPresets(tag?: string): Promise<LightingPreset[]>;
  updateLightingPreset(id: string, updates: Partial<Omit<LightingPreset, 'id' | 'createdAt'>>): Promise<LightingPreset | null>;
  deleteLightingPreset(id: string): Promise<boolean>;
  createRenderPreset(preset: RenderPreset): Promise<RenderPreset>;
  getRenderPreset(id: string): Promise<RenderPreset | null>;
  listRenderPresets(options?: { assetId?: string }): Promise<RenderPreset[]>;
  deleteRenderPreset(id: string): Promise<boolean>;
  createMaterialVariant(data: Omit<MaterialVariant, 'id' | 'createdAt'>): Promise<MaterialVariant>;
  getMaterialVariant(id: string): Promise<MaterialVariant | null | undefined>;
  listMaterialVariants(assetId: string): Promise<MaterialVariant[]>;
  updateMaterialVariant(id: string, updates: Partial<Omit<MaterialVariant, 'id' | 'createdAt'>>): Promise<MaterialVariant | null | undefined>;
  deleteMaterialVariant(id: string): Promise<boolean>;
  initialize?(): Promise<void>;
  close?(): Promise<void>;
}

interface ListOptions {
  status?: AssetStatus;
  limit?: number;
  offset?: number;
  assetId?: string;
}

/**
 * Wrapper to make MemoryStore compatible with async Store interface
 */
function createAsyncStore(memoryStore: MemoryStore): Store {
  return {
    createAsset: (asset) => Promise.resolve(memoryStore.createAsset(asset)),
    getAsset: (id) => Promise.resolve(memoryStore.getAsset(id)),
    listAssets: (options) => Promise.resolve(memoryStore.listAssets(options)),
    updateAsset: (id, updates) => Promise.resolve(memoryStore.updateAsset(id, updates)),
    deleteAsset: (id) => Promise.resolve(memoryStore.deleteAsset(id)),
    createLightingPreset: (preset) => Promise.resolve(memoryStore.createLightingPreset(preset)),
    getLightingPreset: (id) => Promise.resolve(memoryStore.getLightingPreset(id)),
    listLightingPresets: (tag) => Promise.resolve(memoryStore.listLightingPresets(tag)),
    updateLightingPreset: (id, updates) => Promise.resolve(memoryStore.updateLightingPreset(id, updates)),
    deleteLightingPreset: (id) => Promise.resolve(memoryStore.deleteLightingPreset(id)),
    createRenderPreset: (preset) => Promise.resolve(memoryStore.createRenderPreset(preset)),
    getRenderPreset: (id) => Promise.resolve(memoryStore.getRenderPreset(id)),
    listRenderPresets: (options) => Promise.resolve(memoryStore.listRenderPresets(options)),
    deleteRenderPreset: (id) => Promise.resolve(memoryStore.deleteRenderPreset(id)),
    createMaterialVariant: (data) => Promise.resolve(memoryStore.createMaterialVariant(data)),
    getMaterialVariant: (id) => Promise.resolve(memoryStore.getMaterialVariant(id)),
    listMaterialVariants: (assetId) => Promise.resolve(memoryStore.listMaterialVariants(assetId)),
    updateMaterialVariant: (id, updates) => Promise.resolve(memoryStore.updateMaterialVariant(id, updates)),
    deleteMaterialVariant: (id) => Promise.resolve(memoryStore.deleteMaterialVariant(id)),
  };
}

/**
 * Adapter to make Store compatible with ManifestStore interface
 */
class StoreAdapter implements ManifestStore {
  constructor(private readonly store: Store) {}

  async getAsset(id: string) {
    return this.store.getAsset(id);
  }

  async getLightingPreset(id: string) {
    return this.store.getLightingPreset(id);
  }

  async getRenderPreset(id: string) {
    return this.store.getRenderPreset(id);
  }

  async getMaterialVariant(id: string) {
    return this.store.getMaterialVariant?.(id);
  }
}

const require = createRequire(import.meta.url);
const fastifyStatic = require('@fastify/static');

const assetSchema = z.object({
  name: z.string().min(1),
  masterUrl: z.string().min(1),
});

const assetUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(['draft', 'processing', 'ready', 'failed']).optional(),
});

const lightingPresetSchema = z.object({
  name: z.string().min(1),
  hdriUrl: z.string().min(1),
  exposure: z.number(),
  intensity: z.number(),
  tags: z.array(z.string()).default([]),
});

const lightingPresetUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  hdriUrl: z.string().min(1).optional(),
  exposure: z.number().optional(),
  intensity: z.number().optional(),
  tags: z.array(z.string()).optional(),
});

const renderPresetSchema = z.object({
  assetId: z.string().min(1),
  lightingPresetId: z.string().min(1),
  camera: z.object({
    fov: z.number(),
    position: z.tuple([z.number(), z.number(), z.number()]),
    target: z.tuple([z.number(), z.number(), z.number()]),
  }),
});

// Material Variant schemas
const materialVariantSchema = z.object({
  assetId: z.string().min(1),
  name: z.string().min(1),
  // PBR texture maps (all optional)
  albedoMapUrl: z.string().url().optional(),
  normalMapUrl: z.string().url().optional(),
  metallicMapUrl: z.string().url().optional(),
  roughnessMapUrl: z.string().url().optional(),
  aoMapUrl: z.string().url().optional(),
  emissiveMapUrl: z.string().url().optional(),
  // PBR scalar values (all optional)
  baseColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  metallic: z.number().min(0).max(1).optional(),
  roughness: z.number().min(0).max(1).optional(),
  status: z.enum(['draft', 'processing', 'ready', 'failed']).default('draft'),
});

const materialVariantUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  // PBR texture maps (all optional)
  albedoMapUrl: z.string().url().optional(),
  normalMapUrl: z.string().url().optional(),
  metallicMapUrl: z.string().url().optional(),
  roughnessMapUrl: z.string().url().optional(),
  aoMapUrl: z.string().url().optional(),
  emissiveMapUrl: z.string().url().optional(),
  // PBR scalar values (all optional)
  baseColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  metallic: z.number().min(0).max(1).optional(),
  roughness: z.number().min(0).max(1).optional(),
  status: z.enum(['draft', 'processing', 'ready', 'failed']).optional(),
});

export async function createApp() {
  const app = Fastify({ logger: false });

  // Conditionally use PgStore if DATABASE_URL is set, otherwise use MemoryStore
  let store: Store;
  const usePostgres = process.env.DATABASE_URL && process.env.DATABASE_URL !== '';

  if (usePostgres) {
    const pgStore = new PgStore();
    await pgStore.initialize();
    store = pgStore;
    console.log('[Store] Using PostgreSQL database');
  } else {
    // Wrap MemoryStore to make it async-compatible
    const memoryStore = new MemoryStore();
    store = createAsyncStore(memoryStore);
    console.log('[Store] Using in-memory store');
  }

  const storage = new LocalStorageService(process.env.STORAGE_BASE_URL ?? 's3://bucket');
  const cdnService = createCDNService();
  const renderManifestService = new RenderManifestService(new StoreAdapter(store), storage, cdnService);

  // Initialize medium priority services
  const dracoCompressor = createDracoCompressor();
  const versioningService = createAssetVersioningService();
  const batchService = createBatchOperationsService();
  const eventsService = createWebhooksEventsService();

  // ===== V4: Initialize new high-priority services =====
  const authService = getAuthService();
  const usdzConverter = getUSDZConverter();
  const thumbnailGenerator = getThumbnailGenerator();
  const searchService = createSearchService(store as any);
  const tagsService = createTagsService(store as any);

  // Register event handlers for versioning
  eventsService.on('asset.updated', async (event) => {
    const assetId = event.data.assetId as string;
    const asset = await store.getAsset(assetId);
    if (asset) {
      await versioningService.autoSnapshot(asset, event.data.updates as Partial<Omit<Asset3D, 'id' | 'createdAt'>>);
    }
  });

  eventsService.on('asset.deleted', async (event) => {
    const assetId = event.data.assetId as string;
    versioningService.deleteVersions(assetId);
  });

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const publicPath = path.resolve(__dirname, '../public');

  app.register(fastifyStatic, {
    root: publicPath,
  });

  // Health check endpoint
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // ===== V4: Register authentication routes =====
  await registerAuthRoutes(app, { prefix: '/auth' });

  app.post('/assets', async (request, reply) => {
    const payload = assetSchema.parse(request.body);
    const now = new Date().toISOString();
    const asset: Asset3D = {
      id: randomUUID(),
      name: payload.name,
      masterUrl: payload.masterUrl,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    };

    await store.createAsset(asset);
    return reply.status(201).send(asset);
  });

  app.post('/uploads/presign', async (request) => {
    const payload = z.object({ path: z.string().min(1) }).parse(request.body);
    return storage.presignUpload(payload.path);
  });

  app.get('/assets/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const asset = await store.getAsset(id);
    if (!asset) return reply.status(404).send({ error: 'asset_not_found' });
    return reply.send(asset);
  });

  app.get('/viewer/assets/:assetId', async (request, reply) => {
    const assetId = (request.params as { assetId: string }).assetId;
    const asset = await store.getAsset(assetId);
    if (!asset) return reply.status(404).send({ error: 'asset_not_found' });
    return reply.send({
      assetId: asset.id,
      masterUrl: asset.masterUrl,
      status: asset.status,
    });
  });

  app.post('/presets/lighting', async (request, reply) => {
    const payload = lightingPresetSchema.parse(request.body);
    const now = new Date().toISOString();
    const preset: LightingPreset = {
      id: randomUUID(),
      name: payload.name,
      hdriUrl: payload.hdriUrl,
      exposure: payload.exposure,
      intensity: payload.intensity,
      tags: payload.tags,
      createdAt: now,
      updatedAt: now,
    };

    await store.createLightingPreset(preset);
    return reply.status(201).send(preset);
  });

  app.get('/viewer/presets', async (request, reply) => {
    const tag = (request.query as { tag?: string }).tag;
    const presets = await store.listLightingPresets(tag);
    return reply.send({ items: presets });
  });

  app.post('/presets/render', async (request, reply) => {
    const payload = renderPresetSchema.parse(request.body);
    const asset = await store.getAsset(payload.assetId);
    const lighting = await store.getLightingPreset(payload.lightingPresetId);

    if (!asset) return reply.status(404).send({ error: 'asset_not_found' });
    if (!lighting) return reply.status(404).send({ error: 'lighting_not_found' });

    const now = new Date().toISOString();
    const preset: RenderPreset = {
      id: randomUUID(),
      assetId: payload.assetId,
      lightingPresetId: payload.lightingPresetId,
      camera: payload.camera,
      createdAt: now,
      updatedAt: now,
    };

    await store.createRenderPreset(preset);
    return reply.status(201).send(preset);
  });

  // ===== Admin API Endpoints =====

  // List all assets with optional filters
  app.get('/assets', async (request, reply) => {
    const query = request.query as {
      status?: AssetStatus;
      limit?: string;
      offset?: string;
    };

    const result = await store.listAssets({
      status: query.status,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
      offset: query.offset ? parseInt(query.offset, 10) : undefined,
    });

    return reply.send(result);
  });

  // Update asset
  app.patch('/assets/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const updates = assetUpdateSchema.parse(request.body);

    const updated = await store.updateAsset(id, updates);
    if (!updated) return reply.status(404).send({ error: 'asset_not_found' });

    return reply.send(updated);
  });

  // Delete asset
  app.delete('/assets/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;

    const deleted = await store.deleteAsset(id);
    if (!deleted) return reply.status(404).send({ error: 'asset_not_found' });

    return reply.status(204).send();
  });

  // List all lighting presets
  app.get('/presets/lighting', async (request, reply) => {
    const tag = (request.query as { tag?: string }).tag;
    const presets = await store.listLightingPresets(tag);
    return reply.send({ items: presets });
  });

  // Update lighting preset
  app.patch('/presets/lighting/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const updates = lightingPresetUpdateSchema.parse(request.body);

    const updated = await store.updateLightingPreset(id, updates);
    if (!updated) return reply.status(404).send({ error: 'lighting_preset_not_found' });

    return reply.send(updated);
  });

  // Delete lighting preset
  app.delete('/presets/lighting/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;

    const deleted = await store.deleteLightingPreset(id);
    if (!deleted) return reply.status(404).send({ error: 'lighting_preset_not_found' });

    return reply.status(204).send();
  });

  // List all render presets
  app.get('/presets/render', async (request, reply) => {
    const query = request.query as { assetId?: string };
    const presets = await store.listRenderPresets({ assetId: query.assetId });

    // Enrich with asset and lighting names
    const enriched = await Promise.all(presets.map(async (preset) => {
      const asset = await store.getAsset(preset.assetId);
      const lighting = await store.getLightingPreset(preset.lightingPresetId);
      return {
        ...preset,
        assetName: asset?.name ?? 'Unknown Asset',
        lightingPresetName: lighting?.name ?? 'Unknown Lighting',
      };
    }));

    return reply.send({ items: enriched });
  });

  // Delete render preset
  app.delete('/presets/render/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;

    const deleted = await store.deleteRenderPreset(id);
    if (!deleted) return reply.status(404).send({ error: 'render_preset_not_found' });

    return reply.status(204).send();
  });

  // ===== Material Variant Endpoints =====

  // Create material variant
  app.post('/variants', async (request, reply) => {
    const payload = materialVariantSchema.parse(request.body);

    // Verify the asset exists
    const asset = await store.getAsset(payload.assetId);
    if (!asset) return reply.status(404).send({ error: 'asset_not_found' });

    const variant = await store.createMaterialVariant({
      ...payload,
      status: payload.status ?? 'draft',
    });

    return reply.status(201).send(variant);
  });

  // Get material variant by id
  app.get('/variants/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const variant = await store.getMaterialVariant(id);

    if (!variant) return reply.status(404).send({ error: 'variant_not_found' });

    return reply.send(variant);
  });

  // List material variants for an asset
  app.get('/variants', async (request, reply) => {
    const query = request.query as { assetId?: string };

    if (!query.assetId) {
      return reply.status(400).send({ error: 'assetId_required' });
    }

    // Verify the asset exists
    const asset = await store.getAsset(query.assetId);
    if (!asset) return reply.status(404).send({ error: 'asset_not_found' });

    const variants = await store.listMaterialVariants(query.assetId);
    return reply.send({ items: variants });
  });

  // Update material variant
  app.patch('/variants/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const updates = materialVariantUpdateSchema.parse(request.body);

    // Note: assetId cannot be updated via material variant update
    const updated = await store.updateMaterialVariant(id, updates);
    if (!updated) return reply.status(404).send({ error: 'variant_not_found' });

    return reply.send(updated);
  });

  // Delete material variant
  app.delete('/variants/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;

    const deleted = await store.deleteMaterialVariant(id);
    if (!deleted) return reply.status(404).send({ error: 'variant_not_found' });

    return reply.status(204).send();
  });

  // ===== V3: KTX2 Management Endpoints =====

  const ktx2CompressSchema = z.object({
    quality: z.number().min(1).max(10).optional().default(8),
    formats: z.array(z.enum(['ktx2', 'basis'])).optional().default(['ktx2']),
    generateMipmaps: z.boolean().optional().default(true),
  });

  // Initiate KTX2 compression for an asset
  app.post('/assets/:id/ktx2/compress', async (request, reply) => {
    const id = (request.params as { id: string }).id;

    const asset = await store.getAsset(id);
    if (!asset) return reply.status(404).send({ error: 'asset_not_found' });

    const options = ktx2CompressSchema.parse(request.body);

    // In production, this would queue a background job
    // For now, we'll update the asset with processing status
    const processingStatus = asset.processingStatus || {};
    processingStatus.ktx2 = 'processing';

    await store.updateAsset(id, {
      processingStatus,
    });

    console.log(`[KTX2] Starting compression for asset ${id} with quality ${options.quality}`);

    // STUB: Return immediately with processing status
    // In production, you would enqueue a job and return the job ID
    return reply.status(202).send({
      assetId: id,
      status: 'processing',
      message: 'KTX2 compression started',
    });
  });

  // Get KTX2 compression status
  app.get('/assets/:id/ktx2/status', async (request, reply) => {
    const id = (request.params as { id: string }).id;

    const asset = await store.getAsset(id);
    if (!asset) return reply.status(404).send({ error: 'asset_not_found' });

    const ktx2Status = asset.processingStatus?.ktx2 || 'pending';
    const ktx2Format = asset.textureFormats?.find(f => f.format === 'ktx2');

    return reply.send({
      assetId: id,
      status: ktx2Status,
      format: ktx2Format,
    });
  });

  // Delete KTX2 format for an asset
  app.delete('/assets/:id/ktx2', async (request, reply) => {
    const id = (request.params as { id: string }).id;

    const asset = await store.getAsset(id);
    if (!asset) return reply.status(404).send({ error: 'asset_not_found' });

    // Remove KTX2 format from asset
    const textureFormats = asset.textureFormats?.filter(f => f.format !== 'ktx2') || [];
    const processingStatus = asset.processingStatus || {};
    delete processingStatus.ktx2;

    await store.updateAsset(id, {
      textureFormats,
      processingStatus,
    });

    return reply.status(204).send();
  });

  // ===== V3: LOD Management Endpoints =====

  const lodGenerateSchema = z.object({
    levels: z.array(z.object({
      level: z.number(),
      ratio: z.number(),
      error: z.number(),
      distance: z.number(),
    })).optional(),
    applyWeld: z.boolean().optional().default(true),
    applyPrune: z.boolean().optional().default(true),
  });

  // Generate LODs for an asset
  app.post('/assets/:id/lods/generate', async (request, reply) => {
    const id = (request.params as { id: string }).id;

    const asset = await store.getAsset(id);
    if (!asset) return reply.status(404).send({ error: 'asset_not_found' });

    const options = lodGenerateSchema.parse(request.body);

    // Update processing status
    const processingStatus = asset.processingStatus || {};
    processingStatus.lods = 'processing';

    await store.updateAsset(id, {
      processingStatus,
    });

    console.log(`[LOD] Starting LOD generation for asset ${id}`);

    // STUB: Return immediately with processing status
    // In production, you would enqueue a job and return the job ID
    return reply.status(202).send({
      assetId: id,
      status: 'processing',
      message: 'LOD generation started',
    });
  });

  // List LODs for an asset
  app.get('/assets/:id/lods', async (request, reply) => {
    const id = (request.params as { id: string }).id;

    const asset = await store.getAsset(id);
    if (!asset) return reply.status(404).send({ error: 'asset_not_found' });

    const lodStatus = asset.processingStatus?.lods || 'pending';
    const lods = asset.lods || [];

    return reply.send({
      assetId: id,
      status: lodStatus,
      lods,
    });
  });

  // Delete a specific LOD level
  app.delete('/assets/:id/lods/:level', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const level = parseInt((request.params as { level: string }).level, 10);

    const asset = await store.getAsset(id);
    if (!asset) return reply.status(404).send({ error: 'asset_not_found' });

    const lods = asset.lods?.filter(lod => lod.level !== level) || [];

    await store.updateAsset(id, {
      lods: lods.length > 0 ? lods : undefined,
    });

    return reply.status(204).send();
  });

  // ===== V3: CDN Management Endpoints =====

  const purgeCacheSchema = z.object({
    urls: z.array(z.string().url()),
  });

  // Purge CDN cache
  app.post('/cdn/purge', async (request, reply) => {
    const { urls } = purgeCacheSchema.parse(request.body);

    const result = await cdnService.purgeCache(urls);

    return reply.send(result);
  });

  // Purge CDN cache for a specific asset
  app.post('/assets/:id/cdn/purge', async (request, reply) => {
    const id = (request.params as { id: string }).id;

    const asset = await store.getAsset(id);
    if (!asset) return reply.status(404).send({ error: 'asset_not_found' });

    const variants = {
      master: asset.masterUrl,
      ktx2: asset.textureFormats?.find(f => f.format === 'ktx2')?.url,
      lods: asset.lods?.map(lod => lod.url),
    };

    const result = await cdnService.purgeAsset(id, variants);

    return reply.send(result);
  });

  // Get CDN status
  app.get('/cdn/status', async (request, reply) => {
    const status = cdnService.getStatus();

    return reply.send(status);
  });

  // ===== V3: Enhanced Render Manifest Endpoint =====

  // Update the render endpoint to support V3 query parameters
  app.get('/viewer/assets/:assetId/render', async (request, reply) => {
    const assetId = (request.params as { assetId: string }).assetId;
    const {
      preset: presetId,
      variant: variantId,
      device,
      format,
      maxLod,
      preferKtx2,
    } = request.query as {
      preset?: string;
      variant?: string;
      device?: 'mobile' | 'desktop';
      format?: 'glb' | 'ktx2';
      maxLod?: string;
      preferKtx2?: 'true' | 'false';
    };

    try {
      const params: {
        assetId: string;
        renderPresetId?: string;
        lightingPresetId?: string;
        materialVariantId?: string;
        device?: 'mobile' | 'desktop';
        format?: 'glb' | 'ktx2';
        maxLod?: number;
        preferKtx2?: boolean;
      } = {
        assetId,
        device,
        format,
        preferKtx2: preferKtx2 === 'true',
      };

      if (maxLod !== undefined) {
        params.maxLod = parseInt(maxLod, 10);
      }

      if (variantId) {
        params.materialVariantId = variantId;
      }

      if (!presetId) {
        // No preset specified, use defaults
        const manifest = await renderManifestService.generateDefault(assetId, device, {
          format,
          maxLod: params.maxLod,
        });
        return reply.send(manifest);
      }

      // Try as render preset first, then fall back to lighting preset
      try {
        params.renderPresetId = presetId;
        const manifest = await renderManifestService.generate(params);
        return reply.send(manifest);
      } catch (err: unknown) {
        const error = err as { code?: string };
        if (error.code === 'render_preset_not_found') {
          // Fall back to lighting preset
          delete params.renderPresetId;
          params.lightingPresetId = presetId;
          const manifest = await renderManifestService.generate(params);
          return reply.send(manifest);
        }
        throw err;
      }
    } catch (err) {
      const error = err as { code?: string; message?: string };
      if (error.code === 'asset_not_found') {
        return reply.status(404).send({ error: 'asset_not_found' });
      }
      if (error.code === 'render_preset_not_found') {
        return reply.status(404).send({ error: 'render_preset_not_found' });
      }
      if (error.code === 'lighting_preset_not_found') {
        return reply.status(404).send({ error: 'lighting_preset_not_found' });
      }
      if (error.code === 'invalid_render_preset') {
        return reply.status(400).send({ error: 'invalid_render_preset', message: error.message });
      }
      throw err;
    }
  });

  // ===== Medium Priority: Draco Compression Endpoints =====

  const dracoCompressSchema = z.object({
    encodeSpeed: z.number().min(0).max(10).optional(),
    decodeSpeed: z.number().min(0).max(10).optional(),
    compressionLevel: z.number().min(0).max(10).optional(),
    applyWeld: z.boolean().optional(),
    applyPrune: z.boolean().optional(),
  });

  app.post('/assets/:id/draco/compress', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const asset = await store.getAsset(id);
    if (!asset) return reply.status(404).send({ error: 'asset_not_found' });

    const options = dracoCompressSchema.parse(request.body);

    try {
      const result = await dracoCompressor.compressGLB(asset.masterUrl, options);
      return reply.send(result);
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  app.get('/draco/capabilities', async (request, reply) => {
    return reply.send(dracoCompressor.getCapabilities());
  });

  // ===== Medium Priority: Asset Versioning Endpoints =====

  app.get('/assets/:id/versions', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const asset = await store.getAsset(id);
    if (!asset) return reply.status(404).send({ error: 'asset_not_found' });

    const versions = versioningService.getVersions(id);
    return reply.send({ assetId: id, versions });
  });

  app.post('/assets/:id/versions/:version/rollback', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const version = parseInt((request.params as { version: string }).version, 10);

    const asset = await store.getAsset(id);
    if (!asset) return reply.status(404).send({ error: 'asset_not_found' });

    try {
      const rollbackOptions = z.object({
        createBackup: z.boolean().optional(),
        rollbackReason: z.string().optional(),
      }).parse(request.body);

      if (rollbackOptions.createBackup) {
        versioningService.createVersion(asset, 'Pre-rollback backup');
      }

      const restoredData = versioningService.restoreToVersion(id, version, rollbackOptions);
      const updated = await store.updateAsset(id, restoredData);

      return reply.send(updated || asset);
    } catch (error) {
      return reply.status(400).send({ error: String(error) });
    }
  });

  // ===== Medium Priority: Batch Operations Endpoints =====

  app.post('/batch/upload', async (request, reply) => {
    const payload = z.object({
      items: z.array(z.object({
        name: z.string().min(1),
        masterUrl: z.string().min(1),
        status: z.enum(['draft', 'processing', 'ready', 'failed']).optional(),
      })),
      options: z.object({
        continueOnError: z.boolean().optional(),
        maxConcurrent: z.number().min(1).optional(),
      }).optional(),
    }).parse(request.body);

    const creator = async (item: { name: string; masterUrl: string; status?: AssetStatus }) => {
      const now = new Date().toISOString();
      const asset: Asset3D = {
        id: randomUUID(),
        name: item.name,
        masterUrl: item.masterUrl,
        status: item.status || 'draft',
        createdAt: now,
        updatedAt: now,
      };
      return await store.createAsset(asset);
    };

    const operation = batchService.createOperation('upload', payload.items, payload.options);

    batchService.batchUpload(payload.items, payload.options, creator)
      .then(() => eventsService.emitEvent('batch_operation.completed', { operationId: operation.id }, 'info'))
      .catch(() => eventsService.emitEvent('batch_operation.failed', { operationId: operation.id }, 'error'));

    return reply.status(202).send({
      operationId: operation.id,
      status: operation.status,
      totalItems: operation.totalItems,
    });
  });

  app.get('/batch/operations/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const operation = batchService.getOperation(id);
    if (!operation) return reply.status(404).send({ error: 'operation_not_found' });
    return reply.send(operation);
  });

  // ===== Medium Priority: Webhooks & Events Endpoints =====

  app.post('/webhooks', async (request, reply) => {
    const payload = z.object({
      name: z.string().min(1),
      url: z.string().url(),
      events: z.array(z.string()),
      secret: z.string().optional(),
    }).parse(request.body);

    const webhook = eventsService.createWebhook(
      payload.name,
      payload.url,
      payload.events as any,
      payload.secret
    );

    return reply.status(201).send(webhook);
  });

  app.get('/webhooks', async (request, reply) => {
    const webhooks = eventsService.listWebhooks();
    return reply.send({ webhooks });
  });

  app.delete('/webhooks/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const deleted = eventsService.deleteWebhook(id);
    if (!deleted) return reply.status(404).send({ error: 'webhook_not_found' });
    return reply.status(204).send();
  });

  app.get('/events', async (request, reply) => {
    const query = request.query as { limit?: string; types?: string };
    const filter: { types?: SystemEvent['type'][]; limit?: number } = {};
    if (query.types) filter.types = query.types.split(',') as any;
    if (query.limit) filter.limit = parseInt(query.limit, 10);

    const events = eventsService.getEvents(filter);
    return reply.send({ events });
  });

  app.get('/events/statistics', async (request, reply) => {
    return reply.send(eventsService.getStatistics());
  });

  app.get('/versions/statistics', async (request, reply) => {
    return reply.send(versioningService.getStatistics());
  });

  // ===== V4: High Priority Features =====

  // ===== V4: USDZ Conversion Endpoints =====

  app.post('/assets/:id/usdz', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const asset = await store.getAsset(id);
    if (!asset) return reply.status(404).send({ error: 'asset_not_found' });

    try {
      const usdzUrl = await usdzConverter.convertToUSDZ(asset.masterUrl, {
        assetId: id,
        assetName: asset.name,
      });

      // Update asset with USDZ URL
      await store.updateAsset(id, {
        usdzUrl,
      });

      return reply.send({
        assetId: id,
        usdzUrl,
        message: 'USDZ conversion completed',
      });
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(500).send({ error: err.message || 'USDZ conversion failed' });
    }
  });

  app.get('/assets/:id/usdz', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const asset = await store.getAsset(id);
    if (!asset) return reply.status(404).send({ error: 'asset_not_found' });

    if (!asset.usdzUrl) {
      return reply.status(404).send({ error: 'usdz_not_generated', message: 'USDZ not yet generated for this asset' });
    }

    return reply.send({
      assetId: id,
      usdzUrl: asset.usdzUrl,
    });
  });

  // ===== V4: Thumbnail Generation Endpoints =====

  const thumbnailSchema = z.object({
    angles: z.array(z.enum(['front', 'side', 'top', 'isometric', 'back', 'bottom'])).optional().default(['isometric']),
    width: z.number().min(64).max(4096).optional().default(512),
    height: z.number().min(64).max(4096).optional().default(512),
    backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().default('#ffffff'),
    lighting: z.enum(['studio', 'outdoor', 'neutral']).optional().default('studio'),
  });

  app.post('/assets/:id/thumbnails', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const asset = await store.getAsset(id);
    if (!asset) return reply.status(404).send({ error: 'asset_not_found' });

    const options = thumbnailSchema.parse(request.body);

    try {
      const thumbnails = await thumbnailGenerator.generateThumbnails(asset.masterUrl, options);

      // Update asset with thumbnail URLs
      await store.updateAsset(id, {
        thumbnails: thumbnails.map(t => ({ angle: t.angle, url: t.url })),
      });

      return reply.send({
        assetId: id,
        thumbnails,
        message: 'Thumbnail generation completed',
      });
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(500).send({ error: err.message || 'Thumbnail generation failed' });
    }
  });

  app.get('/assets/:id/thumbnails', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const asset = await store.getAsset(id);
    if (!asset) return reply.status(404).send({ error: 'asset_not_found' });

    const thumbnails = asset.thumbnails || [];

    return reply.send({
      assetId: id,
      thumbnails,
    });
  });

  // ===== V4: Search Endpoints =====

  app.get('/search', async (request, reply) => {
    const query = request.query as {
      q?: string;
      tags?: string;
      categories?: string;
      status?: string;
      format?: string;
      page?: string;
      limit?: string;
      sortBy?: 'relevance' | 'name' | 'createdAt' | 'updatedAt';
    };

    const filters: {
      tags?: string[];
      categories?: string[];
      status?: string;
      format?: string;
    } = {};

    if (query.tags) filters.tags = query.tags.split(',');
    if (query.categories) filters.categories = query.categories.split(',');
    if (query.status) filters.status = query.status;
    if (query.format) filters.format = query.format;

    const page = query.page ? parseInt(query.page, 10) : 1;
    const limit = query.limit ? parseInt(query.limit, 10) : 20;

    try {
      const results = await searchService.search(query.q || '', {
        filters,
        page,
        limit,
        sortBy: query.sortBy || 'relevance',
      });

      return reply.send(results);
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(500).send({ error: err.message || 'Search failed' });
    }
  });

  app.get('/search/suggestions', async (request, reply) => {
    const query = request.query as {
      q?: string;
      limit?: string;
    };

    if (!query.q) {
      return reply.status(400).send({ error: 'query_required' });
    }

    const limit = query.limit ? parseInt(query.limit, 10) : 5;

    try {
      const suggestions = await searchService.getSuggestions(query.q, limit);
      return reply.send({ suggestions });
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(500).send({ error: err.message || 'Failed to get suggestions' });
    }
  });

  app.get('/search/similar/:assetId', async (request, reply) => {
    const assetId = (request.params as { assetId: string }).assetId;
    const asset = await store.getAsset(assetId);
    if (!asset) return reply.status(404).send({ error: 'asset_not_found' });

    const query = request.query as {
      limit?: string;
    };

    const limit = query.limit ? parseInt(query.limit, 10) : 10;

    try {
      const similar = await searchService.findSimilar(assetId, limit);
      return reply.send({ assetId, similar });
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(500).send({ error: err.message || 'Failed to find similar assets' });
    }
  });

  app.post('/search/spatial', async (request, reply) => {
    const payload = z.object({
      bounds: z.object({
        minX: z.number(),
        minY: z.number(),
        minZ: z.number(),
        maxX: z.number(),
        maxY: z.number(),
        maxZ: z.number(),
      }),
      strict: z.boolean().optional().default(false),
    }).parse(request.body);

    try {
      const results = await searchService.spatialSearch(payload.bounds, payload.strict);
      return reply.send({ bounds: payload.bounds, results });
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(500).send({ error: err.message || 'Spatial search failed' });
    }
  });

  // ===== V4: Tags Endpoints =====

  const tagSchema = z.object({
    name: z.string().min(1),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    description: z.string().optional(),
    parentId: z.string().optional(),
  });

  app.post('/tags', async (request, reply) => {
    const payload = tagSchema.parse(request.body);

    try {
      const tag = await tagsService.createTag(payload);
      return reply.status(201).send(tag);
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(400).send({ error: err.message || 'Failed to create tag' });
    }
  });

  app.get('/tags', async (request, reply) => {
    const query = request.query as {
      search?: string;
      limit?: string;
    };

    try {
      if (query.search) {
        const limit = query.limit ? parseInt(query.limit, 10) : 10;
        const tags = await tagsService.searchTags(query.search, limit);
        return reply.send({ tags });
      }

      const tags = await tagsService.getTags();
      return reply.send({ tags });
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(500).send({ error: err.message || 'Failed to get tags' });
    }
  });

  app.get('/tags/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;

    try {
      const tag = await tagsService.getTagById(id);
      if (!tag) return reply.status(404).send({ error: 'tag_not_found' });
      return reply.send(tag);
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(500).send({ error: err.message || 'Failed to get tag' });
    }
  });

  app.patch('/tags/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const payload = tagSchema.partial().parse(request.body);

    try {
      const tag = await tagsService.updateTag(id, payload);
      if (!tag) return reply.status(404).send({ error: 'tag_not_found' });
      return reply.send(tag);
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(400).send({ error: err.message || 'Failed to update tag' });
    }
  });

  app.delete('/tags/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;

    try {
      const deleted = await tagsService.deleteTag(id);
      if (!deleted) return reply.status(404).send({ error: 'tag_not_found' });
      return reply.status(204).send();
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(400).send({ error: err.message || 'Failed to delete tag' });
    }
  });

  // Asset tags endpoints
  app.get('/assets/:id/tags', async (request, reply) => {
    const assetId = (request.params as { id: string }).id;

    try {
      const tags = await tagsService.getAssetTags(assetId);
      return reply.send({ assetId, tags });
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(500).send({ error: err.message || 'Failed to get asset tags' });
    }
  });

  app.put('/assets/:id/tags', async (request, reply) => {
    const assetId = (request.params as { id: string }).id;
    const payload = z.object({
      tagIds: z.array(z.string()),
    }).parse(request.body);

    try {
      await tagsService.setAssetTags(assetId, payload.tagIds);
      const tags = await tagsService.getAssetTags(assetId);
      return reply.send({ assetId, tags });
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(400).send({ error: err.message || 'Failed to set asset tags' });
    }
  });

  app.post('/assets/:id/tags', async (request, reply) => {
    const assetId = (request.params as { id: string }).id;
    const payload = z.object({
      tagIds: z.array(z.string()),
    }).parse(request.body);

    try {
      await tagsService.addTagsToAsset(assetId, payload.tagIds);
      const tags = await tagsService.getAssetTags(assetId);
      return reply.send({ assetId, tags });
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(400).send({ error: err.message || 'Failed to add tags to asset' });
    }
  });

  app.delete('/assets/:id/tags', async (request, reply) => {
    const assetId = (request.params as { id: string }).id;
    const payload = z.object({
      tagIds: z.array(z.string()),
    }).parse(request.body);

    try {
      await tagsService.removeTagsFromAsset(assetId, payload.tagIds);
      const tags = await tagsService.getAssetTags(assetId);
      return reply.send({ assetId, tags });
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(400).send({ error: err.message || 'Failed to remove tags from asset' });
    }
  });

  // Auto-tagging suggestions
  app.get('/assets/:id/tags/suggestions', async (request, reply) => {
    const assetId = (request.params as { id: string }).id;

    try {
      const suggestions = await tagsService.suggestTags(assetId);
      return reply.send({ assetId, suggestions });
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(500).send({ error: err.message || 'Failed to get tag suggestions' });
    }
  });

  // Bulk tag operations
  app.post('/tags/bulk', async (request, reply) => {
    const payload = z.object({
      assetIds: z.array(z.string()),
      tagIds: z.array(z.string()),
      operation: z.enum(['add', 'remove', 'replace']),
    }).parse(request.body);

    try {
      const result = await tagsService.bulkTagOperation(payload);
      return reply.send(result);
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(400).send({ error: err.message || 'Bulk operation failed' });
    }
  });

  // ===== V4: Categories Endpoints =====

  const categorySchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    icon: z.string().optional(),
    parentId: z.string().optional(),
    order: z.number().optional(),
  });

  app.post('/categories', async (request, reply) => {
    const payload = categorySchema.parse(request.body);

    try {
      const category = await tagsService.createCategory(payload);
      return reply.status(201).send(category);
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(400).send({ error: err.message || 'Failed to create category' });
    }
  });

  app.get('/categories', async (request, reply) => {
    const query = request.query as {
      tree?: 'true' | 'false';
    };

    try {
      if (query.tree === 'true') {
        const tree = await tagsService.getCategoryTree();
        return reply.send({ tree });
      }

      const categories = await tagsService.getCategories();
      return reply.send({ categories });
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(500).send({ error: err.message || 'Failed to get categories' });
    }
  });

  app.get('/categories/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;

    try {
      const category = await tagsService.getCategories();
      const found = category.find(c => c.id === id);
      if (!found) return reply.status(404).send({ error: 'category_not_found' });
      return reply.send(found);
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(500).send({ error: err.message || 'Failed to get category' });
    }
  });

  app.patch('/categories/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const payload = categorySchema.partial().parse(request.body);

    try {
      const category = await tagsService.updateCategory(id, payload);
      if (!category) return reply.status(404).send({ error: 'category_not_found' });
      return reply.send(category);
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(400).send({ error: err.message || 'Failed to update category' });
    }
  });

  app.delete('/categories/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;

    try {
      const deleted = await tagsService.deleteCategory(id);
      if (!deleted) return reply.status(404).send({ error: 'category_not_found' });
      return reply.status(204).send();
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(400).send({ error: err.message || 'Failed to delete category' });
    }
  });

  // Asset categories endpoints
  app.get('/assets/:id/categories', async (request, reply) => {
    const assetId = (request.params as { id: string }).id;

    try {
      const categories = await tagsService.getAssetCategories(assetId);
      return reply.send({ assetId, categories });
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(500).send({ error: err.message || 'Failed to get asset categories' });
    }
  });

  app.post('/assets/:id/categories', async (request, reply) => {
    const assetId = (request.params as { id: string }).id;
    const payload = z.object({
      categoryId: z.string(),
    }).parse(request.body);

    try {
      await tagsService.addAssetToCategory(assetId, payload.categoryId);
      const categories = await tagsService.getAssetCategories(assetId);
      return reply.send({ assetId, categories });
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(400).send({ error: err.message || 'Failed to add asset to category' });
    }
  });

  app.delete('/assets/:id/categories/:categoryId', async (request, reply) => {
    const assetId = (request.params as { id: string }).assetId;
    const categoryId = (request.params as { categoryId: string }).categoryId;

    try {
      await tagsService.removeAssetFromCategory(assetId, categoryId);
      const categories = await tagsService.getAssetCategories(assetId);
      return reply.send({ assetId, categories });
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(400).send({ error: err.message || 'Failed to remove asset from category' });
    }
  });

  // ===== V4: Collections Endpoints =====

  const collectionSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    coverAssetId: z.string().optional(),
    isPublic: z.boolean().optional(),
    userId: z.string(),
  });

  app.post('/collections', async (request, reply) => {
    const payload = collectionSchema.parse(request.body);

    try {
      const collection = await tagsService.createCollection(payload);
      return reply.status(201).send(collection);
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(400).send({ error: err.message || 'Failed to create collection' });
    }
  });

  app.get('/collections', async (request, reply) => {
    const query = request.query as {
      userId?: string;
    };

    try {
      const collections = await tagsService.getCollections(query.userId);
      return reply.send({ collections });
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(500).send({ error: err.message || 'Failed to get collections' });
    }
  });

  app.get('/collections/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;

    try {
      const collection = await tagsService.getCollectionById(id);
      if (!collection) return reply.status(404).send({ error: 'collection_not_found' });
      return reply.send(collection);
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(500).send({ error: err.message || 'Failed to get collection' });
    }
  });

  app.patch('/collections/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const payload = collectionSchema.partial().omit({ userId: true }).parse(request.body);

    try {
      const collection = await tagsService.updateCollection(id, payload);
      if (!collection) return reply.status(404).send({ error: 'collection_not_found' });
      return reply.send(collection);
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(400).send({ error: err.message || 'Failed to update collection' });
    }
  });

  app.delete('/collections/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;

    try {
      const deleted = await tagsService.deleteCollection(id);
      if (!deleted) return reply.status(404).send({ error: 'collection_not_found' });
      return reply.status(204).send();
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(400).send({ error: err.message || 'Failed to delete collection' });
    }
  });

  // Collection assets endpoints
  app.get('/collections/:id/assets', async (request, reply) => {
    const collectionId = (request.params as { id: string }).id;

    try {
      const assets = await tagsService.getCollectionAssets(collectionId);
      return reply.send({ collectionId, assets });
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(500).send({ error: err.message || 'Failed to get collection assets' });
    }
  });

  app.post('/collections/:id/assets', async (request, reply) => {
    const collectionId = (request.params as { id: string }).id;
    const payload = z.object({
      assetIds: z.array(z.string()),
    }).parse(request.body);

    try {
      await tagsService.addAssetsToCollection(collectionId, payload.assetIds);
      const collection = await tagsService.getCollectionById(collectionId);
      return reply.send(collection);
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(400).send({ error: err.message || 'Failed to add assets to collection' });
    }
  });

  app.delete('/collections/:id/assets', async (request, reply) => {
    const collectionId = (request.params as { id: string }).id;
    const payload = z.object({
      assetIds: z.array(z.string()),
    }).parse(request.body);

    try {
      await tagsService.removeAssetsFromCollection(collectionId, payload.assetIds);
      const collection = await tagsService.getCollectionById(collectionId);
      return reply.send(collection);
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(400).send({ error: err.message || 'Failed to remove assets from collection' });
    }
  });

  // ===== V4: Statistics Endpoints =====

  app.get('/tags/stats', async (request, reply) => {
    try {
      const stats = await tagsService.getStats();
      return reply.send(stats);
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(500).send({ error: err.message || 'Failed to get stats' });
    }
  });

  // ===== V5: Custom Fields / Asset Types Routes =====
  await registerAssetTypesRoutes(app, { prefix: '/asset-types' });

  // ===== V5: Workflow Routes =====
  await registerWorkflowRoutes(app, { prefix: '/workflow' });

  // ===== V5: Export Routes =====
  await registerExportRoutes(app, { prefix: '/exports' });

  // ===== V5: Analytics Routes =====
  await registerAnalyticsRoutes(app, { prefix: '/analytics' });

  // ===== V5: Initialize Analytics with existing assets =====
  const analyticsService = getAnalyticsService();
  const allAssets = await store.listAssets({ limit: 1000 });
  for (const asset of allAssets.items) {
    analyticsService.registerAsset(asset.id, asset.name);
  }

  return app;
}
