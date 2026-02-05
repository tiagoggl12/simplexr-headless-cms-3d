import Fastify from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { MemoryStore } from './store.js';
import { LocalStorageService } from './services/storage.js';
import { Asset3D, AssetStatus, LightingPreset, RenderManifest, RenderPreset } from './models.js';

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

export async function createApp() {
  const app = Fastify({ logger: false });
  const store = new MemoryStore();
  const storage = new LocalStorageService(process.env.STORAGE_BASE_URL ?? 's3://bucket');

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

    store.createAsset(asset);
    return reply.status(201).send(asset);
  });

  app.post('/uploads/presign', async (request) => {
    const payload = z.object({ path: z.string().min(1) }).parse(request.body);
    return storage.presignUpload(payload.path);
  });

  app.get('/assets/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const asset = store.getAsset(id);
    if (!asset) return reply.status(404).send({ error: 'asset_not_found' });
    return reply.send(asset);
  });

  app.get('/viewer/assets/:assetId', async (request, reply) => {
    const assetId = (request.params as { assetId: string }).assetId;
    const asset = store.getAsset(assetId);
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

    store.createLightingPreset(preset);
    return reply.status(201).send(preset);
  });

  app.get('/viewer/presets', async (request, reply) => {
    const tag = (request.query as { tag?: string }).tag;
    const presets = store.listLightingPresets(tag);
    return reply.send({ items: presets });
  });

  app.post('/presets/render', async (request, reply) => {
    const payload = renderPresetSchema.parse(request.body);
    const asset = store.getAsset(payload.assetId);
    const lighting = store.getLightingPreset(payload.lightingPresetId);

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

    store.createRenderPreset(preset);
    return reply.status(201).send(preset);
  });

  app.get('/viewer/assets/:assetId/render', async (request, reply) => {
    const assetId = (request.params as { assetId: string }).assetId;
    const { preset: presetId, device } = request.query as {
      preset?: string;
      device?: string;
    };

    if (!presetId) return reply.status(400).send({ error: 'preset_required' });

    const asset = store.getAsset(assetId);
    if (!asset) return reply.status(404).send({ error: 'asset_not_found' });

    const renderPreset = store.getRenderPreset(presetId);
    if (!renderPreset) return reply.status(404).send({ error: 'render_preset_not_found' });

    const lighting = store.getLightingPreset(renderPreset.lightingPresetId);
    if (!lighting) return reply.status(404).send({ error: 'lighting_not_found' });

    const qualityProfile: RenderManifest['qualityProfile'] =
      device === 'mobile' ? 'mobile' : 'desktop';

    const manifest: RenderManifest = {
      version: 'v1',
      asset: {
        id: asset.id,
        masterUrl: asset.masterUrl,
      },
      lighting,
      camera: renderPreset.camera,
      qualityProfile,
    };

    return reply.send(manifest);
  });

  // ===== Admin API Endpoints =====

  // List all assets with optional filters
  app.get('/assets', async (request, reply) => {
    const query = request.query as {
      status?: AssetStatus;
      limit?: string;
      offset?: string;
    };

    const result = store.listAssets({
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

    const updated = store.updateAsset(id, updates);
    if (!updated) return reply.status(404).send({ error: 'asset_not_found' });

    return reply.send(updated);
  });

  // Delete asset
  app.delete('/assets/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;

    const deleted = store.deleteAsset(id);
    if (!deleted) return reply.status(404).send({ error: 'asset_not_found' });

    return reply.status(204).send();
  });

  // List all lighting presets
  app.get('/presets/lighting', async (request, reply) => {
    const tag = (request.query as { tag?: string }).tag;
    const presets = store.listLightingPresets(tag);
    return reply.send({ items: presets });
  });

  // Update lighting preset
  app.patch('/presets/lighting/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const updates = lightingPresetUpdateSchema.parse(request.body);

    const updated = store.updateLightingPreset(id, updates);
    if (!updated) return reply.status(404).send({ error: 'lighting_preset_not_found' });

    return reply.send(updated);
  });

  // Delete lighting preset
  app.delete('/presets/lighting/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;

    const deleted = store.deleteLightingPreset(id);
    if (!deleted) return reply.status(404).send({ error: 'lighting_preset_not_found' });

    return reply.status(204).send();
  });

  // List all render presets
  app.get('/presets/render', async (request, reply) => {
    const query = request.query as { assetId?: string };
    const presets = store.listRenderPresets({ assetId: query.assetId });

    // Enrich with asset and lighting names
    const enriched = presets.map((preset) => {
      const asset = store.getAsset(preset.assetId);
      const lighting = store.getLightingPreset(preset.lightingPresetId);
      return {
        ...preset,
        assetName: asset?.name ?? 'Unknown Asset',
        lightingPresetName: lighting?.name ?? 'Unknown Lighting',
      };
    });

    return reply.send({ items: enriched });
  });

  // Delete render preset
  app.delete('/presets/render/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;

    const deleted = store.deleteRenderPreset(id);
    if (!deleted) return reply.status(404).send({ error: 'render_preset_not_found' });

    return reply.status(204).send();
  });

  return app;
}
