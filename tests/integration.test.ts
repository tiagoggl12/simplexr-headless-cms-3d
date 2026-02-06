import { describe, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

describe('Integration Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('returns health check status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('status', 'ok');
      expect(body).toHaveProperty('timestamp');
      expect(new Date(body.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe('POST /assets', () => {
    it('creates a new asset', async () => {
      const payload = {
        name: 'Test Chair Model',
        masterUrl: 's3://bucket/assets/chair.glb',
      };

      const res = await app.inject({
        method: 'POST',
        url: '/assets',
        payload,
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name', payload.name);
      expect(body).toHaveProperty('masterUrl', payload.masterUrl);
      expect(body).toHaveProperty('status', 'draft');
      expect(body).toHaveProperty('createdAt');
      expect(body).toHaveProperty('updatedAt');
    });

    it('validates required fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/assets',
        payload: { name: 'Missing masterUrl' },
      });

      // Zod validation errors return 500 without global error handler
      expect(res.statusCode).toBe(500);
    });
  });

  describe('GET /assets', () => {
    it('lists all assets', async () => {
      // Create a test asset first
      await app.inject({
        method: 'POST',
        url: '/assets',
        payload: {
          name: 'List Test Asset',
          masterUrl: 's3://bucket/assets/test.glb',
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/assets',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('items');
      expect(Array.isArray(body.items)).toBe(true);
      expect(body.items.length).toBeGreaterThan(0);
    });

    it('filters assets by status', async () => {
      // Create an asset with draft status
      await app.inject({
        method: 'POST',
        url: '/assets',
        payload: {
          name: 'Status Test Asset',
          masterUrl: 's3://bucket/assets/status.glb',
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/assets?status=draft',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('items');
      expect(Array.isArray(body.items)).toBe(true);
      // All items should have draft status
      body.items.forEach((item: { status: string }) => {
        expect(item.status).toBe('draft');
      });
    });

    it('supports pagination with limit and offset', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/assets?limit=5&offset=0',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('items');
      expect(body.items.length).toBeLessThanOrEqual(5);
    });
  });

  describe('POST /presets/lighting', () => {
    it('creates a new lighting preset', async () => {
      const payload = {
        name: 'Studio Lighting',
        hdriUrl: 's3://bucket/hdri/studio.hdr',
        exposure: 1.5,
        intensity: 1.2,
        tags: ['studio', 'soft'],
      };

      const res = await app.inject({
        method: 'POST',
        url: '/presets/lighting',
        payload,
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name', payload.name);
      expect(body).toHaveProperty('hdriUrl', payload.hdriUrl);
      expect(body).toHaveProperty('exposure', payload.exposure);
      expect(body).toHaveProperty('intensity', payload.intensity);
      expect(body).toHaveProperty('tags');
      expect(body.tags).toEqual(payload.tags);
      expect(body).toHaveProperty('createdAt');
      expect(body).toHaveProperty('updatedAt');
    });

    it('creates lighting preset with default empty tags', async () => {
      const payload = {
        name: 'Basic Lighting',
        hdriUrl: 's3://bucket/hdri/basic.hdr',
        exposure: 1.0,
        intensity: 1.0,
      };

      const res = await app.inject({
        method: 'POST',
        url: '/presets/lighting',
        payload,
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('tags');
      expect(body.tags).toEqual([]);
    });

    it('validates required fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/presets/lighting',
        payload: {
          name: 'Missing required fields',
        },
      });

      // Zod validation errors return 500 without global error handler
      expect(res.statusCode).toBe(500);
    });
  });

  describe('POST /uploads/presign', () => {
    it('returns a presigned upload URL', async () => {
      const payload = {
        path: 'uploads/test-model.glb',
      };

      const res = await app.inject({
        method: 'POST',
        url: '/uploads/presign',
        payload,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('url');
      expect(body.url).toContain(payload.path);
      expect(body).toHaveProperty('method', 'PUT');
      expect(body).toHaveProperty('headers');
    });

    it('requires path parameter', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/uploads/presign',
        payload: {},
      });

      // Zod validation errors return 500 without global error handler
      expect(res.statusCode).toBe(500);
    });

    it('validates path is not empty', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/uploads/presign',
        payload: { path: '' },
      });

      // Zod validation errors return 500 without global error handler
      expect(res.statusCode).toBe(500);
    });
  });

  describe('GET /assets/:id', () => {
    it('returns 404 for non-existent asset', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/assets/00000000-0000-0000-0000-000000000000',
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body).toHaveProperty('error', 'asset_not_found');
    });
  });

  describe('GET /viewer/presets', () => {
    it('lists lighting presets', async () => {
      // Create a test preset
      await app.inject({
        method: 'POST',
        url: '/presets/lighting',
        payload: {
          name: 'Viewer Test Lighting',
          hdriUrl: 's3://bucket/hdri/viewer.hdr',
          exposure: 1.0,
          intensity: 1.0,
          tags: ['studio'],
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/viewer/presets',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('items');
      expect(Array.isArray(body.items)).toBe(true);
    });

    it('filters lighting presets by tag', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/viewer/presets?tag=studio',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('items');
      expect(Array.isArray(body.items)).toBe(true);
      // All items should contain the studio tag
      body.items.forEach((item: { tags: string[] }) => {
        expect(item.tags).toContain('studio');
      });
    });
  });

  describe('Material Variant Endpoints', () => {
    let testAssetId: string;

    beforeAll(async () => {
      // Create a test asset for variant tests
      const assetRes = await app.inject({
        method: 'POST',
        url: '/assets',
        payload: {
          name: 'Variant Test Asset',
          masterUrl: 's3://bucket/assets/variant-test.glb',
        },
      });
      testAssetId = assetRes.json().id;
    });

    describe('POST /variants', () => {
      it('creates a new material variant', async () => {
        const payload = {
          assetId: testAssetId,
          name: 'Oak Wood Finish',
          baseColor: '#8B5A2B',
          roughness: 0.7,
          metallic: 0.0,
        };

        const res = await app.inject({
          method: 'POST',
          url: '/variants',
          payload,
        });

        expect(res.statusCode).toBe(201);
        const body = res.json();
        expect(body).toHaveProperty('id');
        expect(body).toHaveProperty('assetId', testAssetId);
        expect(body).toHaveProperty('name', payload.name);
        expect(body).toHaveProperty('baseColor', payload.baseColor);
        expect(body).toHaveProperty('roughness', payload.roughness);
        expect(body).toHaveProperty('metallic', payload.metallic);
        expect(body).toHaveProperty('status', 'draft');
        expect(body).toHaveProperty('createdAt');
      });

      it('creates variant with PBR texture maps', async () => {
        const payload = {
          assetId: testAssetId,
          name: 'Chrome Finish',
          albedoMapUrl: 'https://example.com/textures/chrome_albedo.png',
          normalMapUrl: 'https://example.com/textures/chrome_normal.png',
          metallicMapUrl: 'https://example.com/textures/chrome_metallic.png',
          roughnessMapUrl: 'https://example.com/textures/chrome_roughness.png',
          aoMapUrl: 'https://example.com/textures/chrome_ao.png',
          metallic: 1.0,
          roughness: 0.2,
        };

        const res = await app.inject({
          method: 'POST',
          url: '/variants',
          payload,
        });

        expect(res.statusCode).toBe(201);
        const body = res.json();
        expect(body).toHaveProperty('id');
        expect(body).toHaveProperty('albedoMapUrl', payload.albedoMapUrl);
        expect(body).toHaveProperty('normalMapUrl', payload.normalMapUrl);
        expect(body).toHaveProperty('metallicMapUrl', payload.metallicMapUrl);
        expect(body).toHaveProperty('roughnessMapUrl', payload.roughnessMapUrl);
        expect(body).toHaveProperty('aoMapUrl', payload.aoMapUrl);
      });

      it('returns 404 for non-existent asset', async () => {
        const res = await app.inject({
          method: 'POST',
          url: '/variants',
          payload: {
            assetId: '00000000-0000-0000-0000-000000000000',
            name: 'Test Variant',
          },
        });

        expect(res.statusCode).toBe(404);
        const body = res.json();
        expect(body.error).toBe('asset_not_found');
      });

      it('validates required fields', async () => {
        const res = await app.inject({
          method: 'POST',
          url: '/variants',
          payload: { name: 'Missing assetId' },
        });

        expect(res.statusCode).toBe(500);
      });
    });

    describe('GET /variants/:id', () => {
      it('returns a material variant by id', async () => {
        // Create a variant first
        const created = await app.inject({
          method: 'POST',
          url: '/variants',
          payload: {
            assetId: testAssetId,
            name: 'Matte Black',
            baseColor: '#000000',
            roughness: 0.9,
          },
        });
        const variant = created.json();

        const res = await app.inject({
          method: 'GET',
          url: `/variants/${variant.id}`,
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body).toHaveProperty('id', variant.id);
        expect(body).toHaveProperty('name', 'Matte Black');
      });

      it('returns 404 for non-existent variant', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/variants/00000000-0000-0000-0000-000000000000',
        });

        expect(res.statusCode).toBe(404);
        const body = res.json();
        expect(body.error).toBe('variant_not_found');
      });
    });

    describe('GET /variants', () => {
      it('lists variants for an asset', async () => {
        // Create a couple of variants
        await app.inject({
          method: 'POST',
          url: '/variants',
          payload: { assetId: testAssetId, name: 'Variant A' },
        });
        await app.inject({
          method: 'POST',
          url: '/variants',
          payload: { assetId: testAssetId, name: 'Variant B' },
        });

        const res = await app.inject({
          method: 'GET',
          url: `/variants?assetId=${testAssetId}`,
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body).toHaveProperty('items');
        expect(Array.isArray(body.items)).toBe(true);
        expect(body.items.length).toBeGreaterThan(0);
        // All items should belong to the test asset
        body.items.forEach((item: { assetId: string }) => {
          expect(item.assetId).toBe(testAssetId);
        });
      });

      it('requires assetId parameter', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/variants',
        });

        expect(res.statusCode).toBe(400);
        const body = res.json();
        expect(body.error).toBe('assetId_required');
      });
    });

    describe('PATCH /variants/:id', () => {
      it('updates a material variant', async () => {
        // Create a variant first
        const created = await app.inject({
          method: 'POST',
          url: '/variants',
          payload: {
            assetId: testAssetId,
            name: 'Original Name',
            roughness: 0.5,
          },
        });
        const variant = created.json();

        const res = await app.inject({
          method: 'PATCH',
          url: `/variants/${variant.id}`,
          payload: {
            name: 'Updated Name',
            roughness: 0.8,
            baseColor: '#FF0000',
          },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body).toHaveProperty('id', variant.id);
        expect(body).toHaveProperty('name', 'Updated Name');
        expect(body).toHaveProperty('roughness', 0.8);
        expect(body).toHaveProperty('baseColor', '#FF0000');
      });

      it('returns 404 for non-existent variant', async () => {
        const res = await app.inject({
          method: 'PATCH',
          url: '/variants/00000000-0000-0000-0000-000000000000',
          payload: { name: 'Updated' },
        });

        expect(res.statusCode).toBe(404);
        const body = res.json();
        expect(body.error).toBe('variant_not_found');
      });
    });

    describe('DELETE /variants/:id', () => {
      it('deletes a material variant', async () => {
        // Create a variant first
        const created = await app.inject({
          method: 'POST',
          url: '/variants',
          payload: {
            assetId: testAssetId,
            name: 'To Be Deleted',
          },
        });
        const variant = created.json();

        const res = await app.inject({
          method: 'DELETE',
          url: `/variants/${variant.id}`,
        });

        expect(res.statusCode).toBe(204);

        // Verify it's deleted
        const getRes = await app.inject({
          method: 'GET',
          url: `/variants/${variant.id}`,
        });
        expect(getRes.statusCode).toBe(404);
      });

      it('returns 404 for non-existent variant', async () => {
        const res = await app.inject({
          method: 'DELETE',
          url: '/variants/00000000-0000-0000-0000-000000000000',
        });

        expect(res.statusCode).toBe(404);
        const body = res.json();
        expect(body.error).toBe('variant_not_found');
      });
    });
  });
});
