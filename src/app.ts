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
  const renderManifestService = new RenderManifestService(new StoreAdapter(store), storage);

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const publicPath = path.resolve(__dirname, '../public');

  app.register(fastifyStatic, {
    root: publicPath,
  });

  // Health check endpoint
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

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

  app.get('/viewer/assets/:assetId/render', async (request, reply) => {
    const assetId = (request.params as { assetId: string }).assetId;
    const { preset: presetId, variant: variantId, device } = request.query as {
      preset?: string;
      variant?: string;
      device?: 'mobile' | 'desktop';
    };

    try {
      // Use render preset if specified, otherwise generate with defaults
      const manifest = presetId
        ? await renderManifestService.generate({
            assetId,
            renderPresetId: presetId,
            materialVariantId: variantId,
            device,
          })
        : await renderManifestService.generateDefault(assetId, device);

      return reply.send(manifest);
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

  return app;
}
