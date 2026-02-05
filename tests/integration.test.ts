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
});
