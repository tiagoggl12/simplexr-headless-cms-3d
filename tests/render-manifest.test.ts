import { describe, it, expect, beforeEach } from 'vitest';
import { RenderManifestService } from '../src/services/render-manifest.js';
import { MemoryStore } from '../src/store.js';
import { LocalStorageService } from '../src/services/storage.js';
import { randomUUID } from 'crypto';

describe('RenderManifestService', () => {
  let store: MemoryStore;
  let storage: LocalStorageService;
  let service: RenderManifestService;
  let assetId: string;
  let lightingPresetId: string;
  let renderPresetId: string;

  beforeEach(() => {
    store = new MemoryStore();
    storage = new LocalStorageService('https://storage.example.com');
    service = new RenderManifestService(store, storage);

    // Create test asset
    assetId = randomUUID();
    store.createAsset({
      id: assetId,
      name: 'Test Chair',
      masterUrl: 'https://storage.example.com/assets/chair.glb',
      status: 'ready',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Create test lighting preset
    lightingPresetId = randomUUID();
    store.createLightingPreset({
      id: lightingPresetId,
      name: 'Studio Lighting',
      hdriUrl: 'https://storage.example.com/hdri/studio.hdr',
      exposure: 1.0,
      intensity: 1.5,
      tags: ['studio', 'product'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Create test render preset
    renderPresetId = randomUUID();
    store.createRenderPreset({
      id: renderPresetId,
      assetId,
      lightingPresetId,
      camera: {
        fov: 45,
        position: [2, 2, 2],
        target: [0, 0, 0],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  describe('generateDefault', () => {
    it('should generate manifest with default values for desktop', async () => {
      const manifest = await service.generateDefault(assetId);

      expect(manifest.version).toBe('1.0');
      expect(manifest.manifest.asset.id).toBe(assetId);
      expect(manifest.manifest.asset.name).toBe('Test Chair');
      expect(manifest.manifest.asset.url).toBe('https://storage.example.com/assets/chair.glb');
      expect(manifest.manifest.asset.format).toBe('glb');

      // Default lighting
      expect(manifest.manifest.lighting.id).toBe('default');
      expect(manifest.manifest.lighting.name).toBe('Default Lighting');
      expect(manifest.manifest.lighting.hdri).toBeDefined();

      // Default camera
      expect(manifest.manifest.camera.fov).toBe(45);
      expect(manifest.manifest.camera.position).toEqual([3, 3, 3]);
      expect(manifest.manifest.camera.target).toEqual([0, 0, 0]);

      // Desktop quality profile
      expect(manifest.manifest.quality.shadows).toBe(true);
      expect(manifest.manifest.quality.antialiasing).toBe('fxaa');
      expect(manifest.manifest.quality.tonemapping).toBe('aces');
    });

    it('should generate manifest with mobile quality profile', async () => {
      const manifest = await service.generateDefault(assetId, 'mobile');

      expect(manifest.manifest.quality.shadows).toBe(false);
      expect(manifest.manifest.quality.antialiasing).toBe('none');
      expect(manifest.manifest.quality.tonemapping).toBe('linear');
    });

    it('should return 404 for non-existent asset', async () => {
      const nonExistentId = randomUUID();
      let error: Error | null = null;
      try {
        await service.generateDefault(nonExistentId);
      } catch (e) {
        error = e as Error;
      }
      expect(error).not.toBeNull();
      expect((error as any).code).toBe('asset_not_found');
    });
  });

  describe('generate with lighting preset', () => {
    it('should use specified lighting preset', async () => {
      const manifest = await service.generate({
        assetId,
        lightingPresetId,
      });

      expect(manifest.manifest.lighting.id).toBe(lightingPresetId);
      expect(manifest.manifest.lighting.name).toBe('Studio Lighting');
      expect(manifest.manifest.lighting.hdri).toBe('https://storage.example.com/hdri/studio.hdr');
      expect(manifest.manifest.lighting.exposure).toBe(1.0);
      expect(manifest.manifest.lighting.intensity).toBe(1.5);
    });

    it('should return 404 for non-existent lighting preset', async () => {
      let error: Error | null = null;
      try {
        await service.generate({
          assetId,
          lightingPresetId: randomUUID(),
        });
      } catch (e) {
        error = e as Error;
      }
      expect(error).not.toBeNull();
      expect((error as any).code).toBe('lighting_preset_not_found');
    });
  });

  describe('generate with render preset', () => {
    it('should use render preset configuration', async () => {
      const manifest = await service.generate({
        assetId,
        renderPresetId,
      });

      // Render preset overrides both lighting and camera
      expect(manifest.manifest.lighting.id).toBe(lightingPresetId);
      expect(manifest.manifest.lighting.name).toBe('Studio Lighting');

      // Camera from render preset
      expect(manifest.manifest.camera.position).toEqual([2, 2, 2]);
      expect(manifest.manifest.camera.target).toEqual([0, 0, 0]);
      expect(manifest.manifest.camera.fov).toBe(45);
    });

    it('should return 404 for non-existent render preset', async () => {
      let error: Error | null = null;
      try {
        await service.generate({
          assetId,
          renderPresetId: randomUUID(),
        });
      } catch (e) {
        error = e as Error;
      }
      expect(error).not.toBeNull();
      expect((error as any).code).toBe('render_preset_not_found');
    });

    it('should return 404 if render preset references non-existent lighting', async () => {
      // Create render preset with invalid lighting reference
      const invalidRenderPresetId = randomUUID();
      store.createRenderPreset({
        id: invalidRenderPresetId,
        assetId,
        lightingPresetId: randomUUID(),
        camera: {
          fov: 45,
          position: [2, 2, 2],
          target: [0, 0, 0],
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      let error: Error | null = null;
      try {
        await service.generate({
          assetId,
          renderPresetId: invalidRenderPresetId,
        });
      } catch (e) {
        error = e as Error;
      }
      expect(error).not.toBeNull();
      expect((error as any).code).toBe('lighting_preset_not_found');
    });
  });

  describe('device quality profiles', () => {
    it('should apply desktop quality profile when device is desktop', async () => {
      const manifest = await service.generate({
        assetId,
        device: 'desktop',
      });

      expect(manifest.manifest.quality.shadows).toBe(true);
      expect(manifest.manifest.quality.antialiasing).toBe('fxaa');
      expect(manifest.manifest.quality.tonemapping).toBe('aces');
    });

    it('should apply mobile quality profile when device is mobile', async () => {
      const manifest = await service.generate({
        assetId,
        device: 'mobile',
      });

      expect(manifest.manifest.quality.shadows).toBe(false);
      expect(manifest.manifest.quality.antialiasing).toBe('none');
      expect(manifest.manifest.quality.tonemapping).toBe('linear');
    });

    it('should default to desktop when device is not specified', async () => {
      const manifest = await service.generate({
        assetId,
      });

      expect(manifest.manifest.quality.shadows).toBe(true);
      expect(manifest.manifest.quality.antialiasing).toBe('fxaa');
      expect(manifest.manifest.quality.tonemapping).toBe('aces');
    });
  });

  describe('schema version', () => {
    it('should include version 1.0 in all manifests', async () => {
      const manifests = await Promise.all([
        service.generateDefault(assetId),
        service.generateDefault(assetId, 'mobile'),
        service.generate({ assetId, lightingPresetId }),
        service.generate({ assetId, renderPresetId }),
      ]);

      for (const manifest of manifests) {
        expect(manifest.version).toBe('1.0');
      }
    });
  });

  describe('error handling', () => {
    it('should prioritize render preset over lighting preset when both provided', async () => {
      // Create another lighting preset
      const otherLightingId = randomUUID();
      store.createLightingPreset({
        id: otherLightingId,
        name: 'Other Lighting',
        hdriUrl: 'https://storage.example.com/hdri/other.hdr',
        exposure: 0.5,
        intensity: 1.0,
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const manifest = await service.generate({
        assetId,
        lightingPresetId: otherLightingId,
        renderPresetId,
      });

      // Should use render preset's lighting, not the separately specified one
      expect(manifest.manifest.lighting.id).toBe(lightingPresetId);
      expect(manifest.manifest.lighting.name).toBe('Studio Lighting');
    });
  });
});
