import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { PgStore } from '../src/services/pg-store.js';
import { Asset3D, AssetStatus, LightingPreset, RenderPreset, MaterialVariant } from '../src/models.js';
import { getPool, closePool } from '../src/db.js';

/**
 * Database integration tests
 *
 * These tests require a running PostgreSQL instance.
 * Set DATABASE_URL environment variable before running.
 *
 * Example:
 *   DATABASE_URL=postgresql://dam:dam@localhost:5432/dam npm test tests/database.test.ts
 */

describe('PgStore', () => {
  let pgStore: PgStore;
  const testAssetId = 'test-asset-1';
  const testLightingId = 'test-lighting-1';
  const testRenderPresetId = 'test-render-1';
  const testMaterialVariantId = 'test-variant-1';

  beforeAll(async () => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      console.warn('DATABASE_URL not set, skipping database tests');
      return;
    }

    pgStore = new PgStore();
    await pgStore.initialize();
  });

  afterAll(async () => {
    if (pgStore) {
      await pgStore.close();
    }
  });

  const sampleAsset: Asset3D = {
    id: testAssetId,
    name: 'Test Chair Model',
    masterUrl: 's3://bucket/test/chair.glb',
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const sampleLighting: LightingPreset = {
    id: testLightingId,
    name: 'Studio Lighting',
    hdriUrl: 's3://bucket/hdri/studio.hdr',
    exposure: 1.0,
    intensity: 1.2,
    tags: ['studio', 'soft'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const sampleRenderPreset: RenderPreset = {
    id: testRenderPresetId,
    assetId: testAssetId,
    lightingPresetId: testLightingId,
    camera: {
      fov: 45,
      position: [0, 2, 4],
      target: [0, 0, 0],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const sampleMaterialVariant: MaterialVariant = {
    id: testMaterialVariantId,
    assetId: testAssetId,
    name: 'Wood Finish',
    albedoMapUrl: 'https://example.com/textures/wood_albedo.jpg',
    normalMapUrl: 'https://example.com/textures/wood_normal.jpg',
    metallic: 0.0,
    roughness: 0.8,
    status: 'draft',
    createdAt: new Date().toISOString(),
  };

  describe('Asset3D CRUD operations', () => {
    it('creates an asset', async () => {
      if (!process.env.DATABASE_URL) return;

      const result = await pgStore.createAsset(sampleAsset);
      expect(result.id).toBe(testAssetId);
      expect(result.name).toBe('Test Chair Model');
      expect(result.status).toBe('draft');
    });

    it('retrieves an asset by id', async () => {
      if (!process.env.DATABASE_URL) return;

      const result = await pgStore.getAsset(testAssetId);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(testAssetId);
      expect(result?.name).toBe('Test Chair Model');
    });

    it('lists assets with pagination', async () => {
      if (!process.env.DATABASE_URL) return;

      const result = await pgStore.listAssets({ limit: 10, offset: 0 });
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0].id).toBe(testAssetId);
      expect(result.total).toBeGreaterThanOrEqual(1);
    });

    it('filters assets by status', async () => {
      if (!process.env.DATABASE_URL) return;

      const result = await pgStore.listAssets({ status: 'draft' });
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items.every((a) => a.status === 'draft')).toBe(true);
    });

    it('updates an asset', async () => {
      if (!process.env.DATABASE_URL) return;

      const result = await pgStore.updateAsset(testAssetId, {
        status: 'ready',
        name: 'Updated Chair Model',
      });

      expect(result).not.toBeNull();
      expect(result?.status).toBe('ready');
      expect(result?.name).toBe('Updated Chair Model');
    });

    it('returns null for non-existent asset', async () => {
      if (!process.env.DATABASE_URL) return;

      const result = await pgStore.getAsset('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('LightingPreset CRUD operations', () => {
    it('creates a lighting preset', async () => {
      if (!process.env.DATABASE_URL) return;

      const result = await pgStore.createLightingPreset(sampleLighting);
      expect(result.id).toBe(testLightingId);
      expect(result.name).toBe('Studio Lighting');
      expect(result.tags).toEqual(['studio', 'soft']);
    });

    it('retrieves a lighting preset by id', async () => {
      if (!process.env.DATABASE_URL) return;

      const result = await pgStore.getLightingPreset(testLightingId);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(testLightingId);
      expect(result?.name).toBe('Studio Lighting');
    });

    it('lists lighting presets filtered by tag', async () => {
      if (!process.env.DATABASE_URL) return;

      const result = await pgStore.listLightingPresets('studio');
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].tags).toContain('studio');
    });

    it('lists all lighting presets', async () => {
      if (!process.env.DATABASE_URL) return;

      const result = await pgStore.listLightingPresets();
      expect(result.length).toBeGreaterThan(0);
    });

    it('updates a lighting preset', async () => {
      if (!process.env.DATABASE_URL) return;

      const result = await pgStore.updateLightingPreset(testLightingId, {
        exposure: 1.5,
      });

      expect(result).not.toBeNull();
      expect(result?.exposure).toBe(1.5);
    });
  });

  describe('RenderPreset CRUD operations', () => {
    it('creates a render preset', async () => {
      if (!process.env.DATABASE_URL) return;

      const result = await pgStore.createRenderPreset(sampleRenderPreset);
      expect(result.id).toBe(testRenderPresetId);
      expect(result.assetId).toBe(testAssetId);
      expect(result.lightingPresetId).toBe(testLightingId);
    });

    it('retrieves a render preset by id', async () => {
      if (!process.env.DATABASE_URL) return;

      const result = await pgStore.getRenderPreset(testRenderPresetId);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(testRenderPresetId);
      expect(result?.camera.fov).toBe(45);
    });

    it('lists render presets for an asset', async () => {
      if (!process.env.DATABASE_URL) return;

      const result = await pgStore.listRenderPresets({ assetId: testAssetId });
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].assetId).toBe(testAssetId);
    });
  });

  describe('MaterialVariant CRUD operations', () => {
    it('creates a material variant', async () => {
      if (!process.env.DATABASE_URL) return;

      const result = await pgStore.createMaterialVariant(sampleMaterialVariant);
      expect(result.id).toBe(testMaterialVariantId);
      expect(result.name).toBe('Wood Finish');
      expect(result.metallic).toBe(0.0);
    });

    it('retrieves a material variant by id', async () => {
      if (!process.env.DATABASE_URL) return;

      const result = await pgStore.getMaterialVariant(testMaterialVariantId);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(testMaterialVariantId);
      expect(result?.name).toBe('Wood Finish');
    });

    it('lists material variants for an asset', async () => {
      if (!process.env.DATABASE_URL) return;

      const result = await pgStore.listMaterialVariants(testAssetId);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe(testMaterialVariantId);
    });

    it('updates a material variant', async () => {
      if (!process.env.DATABASE_URL) return;

      const result = await pgStore.updateMaterialVariant(testMaterialVariantId, {
        roughness: 0.9,
        status: 'ready',
      });

      expect(result).not.toBeNull();
      expect(result?.roughness).toBe(0.9);
      expect(result?.status).toBe('ready');
    });
  });

  describe('Foreign key constraints', () => {
    it('enforces asset reference in render_presets', async () => {
      if (!process.env.DATABASE_URL) return;

      // Create a render preset with non-existent asset
      const invalidPreset: RenderPreset = {
        id: 'invalid-render-preset',
        assetId: 'non-existent-asset',
        lightingPresetId: testLightingId,
        camera: { fov: 45, position: [0, 0, 3], target: [0, 0, 0] },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await expect(pgStore.createRenderPreset(invalidPreset)).rejects.toThrow();
    });

    it('enforces lighting preset reference in render_presets', async () => {
      if (!process.env.DATABASE_URL) return;

      const invalidPreset: RenderPreset = {
        id: 'invalid-render-preset-2',
        assetId: testAssetId,
        lightingPresetId: 'non-existent-lighting',
        camera: { fov: 45, position: [0, 0, 3], target: [0, 0, 0] },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await expect(pgStore.createRenderPreset(invalidPreset)).rejects.toThrow();
    });

    it('enforces asset reference in material_variants', async () => {
      if (!process.env.DATABASE_URL) return;

      const invalidVariant: MaterialVariant = {
        id: 'invalid-variant',
        assetId: 'non-existent-asset',
        name: 'Invalid Variant',
        status: 'draft',
        createdAt: new Date().toISOString(),
      };

      await expect(pgStore.createMaterialVariant(invalidVariant)).rejects.toThrow();
    });

    it('cascades deletes from assets to dependent records', async () => {
      if (!process.env.DATABASE_URL) return;

      // Create a test asset with dependent records
      const testAsset: Asset3D = {
        id: 'cascade-test-asset',
        name: 'Cascade Test',
        masterUrl: 's3://bucket/test.glb',
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await pgStore.createAsset(testAsset);

      const testLighting: LightingPreset = {
        id: 'cascade-test-lighting',
        name: 'Cascade Test Lighting',
        hdriUrl: 's3://bucket/hdri/test.hdr',
        exposure: 1.0,
        intensity: 1.0,
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await pgStore.createLightingPreset(testLighting);

      const testRenderPreset: RenderPreset = {
        id: 'cascade-test-render',
        assetId: 'cascade-test-asset',
        lightingPresetId: 'cascade-test-lighting',
        camera: { fov: 45, position: [0, 0, 3], target: [0, 0, 0] },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await pgStore.createRenderPreset(testRenderPreset);

      const testVariant: MaterialVariant = {
        id: 'cascade-test-variant',
        assetId: 'cascade-test-asset',
        name: 'Cascade Test Variant',
        status: 'draft',
        createdAt: new Date().toISOString(),
      };

      await pgStore.createMaterialVariant(testVariant);

      // Delete the asset
      await pgStore.deleteAsset('cascade-test-asset');

      // Verify dependent records are also deleted
      const renderPreset = await pgStore.getRenderPreset('cascade-test-render');
      expect(renderPreset).toBeNull();

      const variant = await pgStore.getMaterialVariant('cascade-test-variant');
      expect(variant).toBeNull();
    });
  });

  describe('Delete operations', () => {
    it('deletes a material variant', async () => {
      if (!process.env.DATABASE_URL) return;

      const deleted = await pgStore.deleteMaterialVariant(testMaterialVariantId);
      expect(deleted).toBe(true);

      const result = await pgStore.getMaterialVariant(testMaterialVariantId);
      expect(result).toBeNull();
    });

    it('deletes a render preset', async () => {
      if (!process.env.DATABASE_URL) return;

      const deleted = await pgStore.deleteRenderPreset(testRenderPresetId);
      expect(deleted).toBe(true);

      const result = await pgStore.getRenderPreset(testRenderPresetId);
      expect(result).toBeNull();
    });

    it('deletes a lighting preset', async () => {
      if (!process.env.DATABASE_URL) return;

      const deleted = await pgStore.deleteLightingPreset(testLightingId);
      expect(deleted).toBe(true);

      const result = await pgStore.getLightingPreset(testLightingId);
      expect(result).toBeNull();
    });

    it('deletes an asset', async () => {
      if (!process.env.DATABASE_URL) return;

      const deleted = await pgStore.deleteAsset(testAssetId);
      expect(deleted).toBe(true);

      const result = await pgStore.getAsset(testAssetId);
      expect(result).toBeNull();
    });
  });
});
