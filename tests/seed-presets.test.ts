import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

/**
 * Contract test for the team-ready presets created by `scripts/seed.ts`.
 * Mirrors the seed's lighting + render preset payloads to guard against the
 * API contract drifting away from the seed data.
 */

const LIGHTING_PRESETS = [
  { name: 'Studio Softbox', hdriUrl: 'https://cdn.simplexr.local/hdri/studio-softbox.hdr', exposure: 1.0, intensity: 1.2, tags: ['studio', 'product', 'neutral'] },
  { name: 'Warm Showroom', hdriUrl: 'https://cdn.simplexr.local/hdri/warm-showroom.hdr', exposure: 1.1, intensity: 1.0, tags: ['warm', 'showroom', 'interior'] },
  { name: 'Outdoor Daylight', hdriUrl: 'https://cdn.simplexr.local/hdri/outdoor-daylight.hdr', exposure: 1.3, intensity: 1.5, tags: ['outdoor', 'daylight', 'bright'] },
  { name: 'Dramatic Spotlight', hdriUrl: 'https://cdn.simplexr.local/hdri/dramatic-spotlight.hdr', exposure: 0.8, intensity: 2.0, tags: ['dramatic', 'spotlight', 'contrast'] },
  { name: 'Soft Ambient', hdriUrl: 'https://cdn.simplexr.local/hdri/soft-ambient.hdr', exposure: 1.0, intensity: 0.8, tags: ['ambient', 'soft', 'catalog'] },
];

const RENDER_CAMERAS = [
  { fov: 45, position: [4, 2.5, 5] as const, target: [0, 0.6, 0] as const },
  { fov: 35, position: [0, 1.2, 6] as const, target: [0, 0.6, 0] as const },
  { fov: 50, position: [0.01, 8, 0.01] as const, target: [0, 0, 0] as const },
];

describe('Seed presets (team-ready)', () => {
  it('creates the lighting presets and exposes them with tags', async () => {
    const app = await createApp();

    for (const preset of LIGHTING_PRESETS) {
      const res = await app.inject({ method: 'POST', url: '/presets/lighting', payload: preset });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBeTypeOf('string');
      expect(body.name).toBe(preset.name);
      expect(body.tags).toEqual(preset.tags);
    }

    const list = await app.inject({ method: 'GET', url: '/presets/lighting' });
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toHaveLength(LIGHTING_PRESETS.length);

    // Tag filtering works for the seeded tags.
    const studio = await app.inject({ method: 'GET', url: '/presets/lighting?tag=studio' });
    expect(studio.json().items.map((p: { name: string }) => p.name)).toContain('Studio Softbox');

    await app.close();
  });

  it('creates render presets pairing the asset with seeded lighting + cameras', async () => {
    const app = await createApp();

    const asset = (
      await app.inject({
        method: 'POST',
        url: '/assets',
        payload: { name: 'Poltrona Guadalupe', masterUrl: 'http://localhost:3000/poltrona-guadalupe.glb' },
      })
    ).json();

    const lighting = (
      await app.inject({ method: 'POST', url: '/presets/lighting', payload: LIGHTING_PRESETS[0] })
    ).json();

    for (const camera of RENDER_CAMERAS) {
      const res = await app.inject({
        method: 'POST',
        url: '/presets/render',
        payload: { assetId: asset.id, lightingPresetId: lighting.id, camera },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().camera.fov).toBe(camera.fov);
    }

    const list = await app.inject({ method: 'GET', url: `/presets/render?assetId=${asset.id}` });
    expect(list.statusCode).toBe(200);
    const items = list.json().items;
    expect(items).toHaveLength(RENDER_CAMERAS.length);
    expect(items[0].lightingPresetName).toBe(LIGHTING_PRESETS[0].name);

    await app.close();
  });

  it('rejects a render preset that references a missing lighting preset', async () => {
    const app = await createApp();
    const asset = (
      await app.inject({
        method: 'POST',
        url: '/assets',
        payload: { name: 'Orphan', masterUrl: 's3://bucket/orphan.glb' },
      })
    ).json();

    const res = await app.inject({
      method: 'POST',
      url: '/presets/render',
      payload: {
        assetId: asset.id,
        lightingPresetId: 'does-not-exist',
        camera: RENDER_CAMERAS[0],
      },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('lighting_not_found');

    await app.close();
  });
});
