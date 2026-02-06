import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const sampleAsset = {
  name: 'Chair Model',
  masterUrl: 's3://bucket/assets/chair.glb',
};

describe('Asset API', () => {
  it('creates an asset and returns draft status', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/assets',
      payload: sampleAsset,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeTypeOf('string');
    expect(body.status).toBe('draft');
    expect(body.name).toBe(sampleAsset.name);
    await app.close();
  });

  it('returns viewer asset info', async () => {
    const app = await createApp();

    const created = await app.inject({
      method: 'POST',
      url: '/assets',
      payload: sampleAsset,
    });
    const asset = created.json();

    const res = await app.inject({
      method: 'GET',
      url: `/viewer/assets/${asset.id}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.assetId).toBe(asset.id);
    expect(body.masterUrl).toBe(sampleAsset.masterUrl);
    await app.close();
  });

  it('returns a render manifest for a preset', async () => {
    const app = await createApp();

    const created = await app.inject({
      method: 'POST',
      url: '/assets',
      payload: sampleAsset,
    });
    const asset = created.json();

    const preset = await app.inject({
      method: 'POST',
      url: '/presets/lighting',
      payload: {
        name: 'studio_soft',
        hdriUrl: 's3://bucket/hdri/studio.hdr',
        exposure: 1.0,
        intensity: 1.2,
        tags: ['studio'],
      },
    });
    const lighting = preset.json();

    const renderPreset = await app.inject({
      method: 'POST',
      url: '/presets/render',
      payload: {
        assetId: asset.id,
        lightingPresetId: lighting.id,
        camera: { fov: 45, position: [0, 0, 3], target: [0, 0, 0] },
      },
    });
    const render = renderPreset.json();

    const res = await app.inject({
      method: 'GET',
      url: `/viewer/assets/${asset.id}/render?preset=${render.id}&device=mobile`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.version).toBe('1.0');
    expect(body.manifest.asset.id).toBe(asset.id);
    expect(body.manifest.lighting.id).toBe(lighting.id);
    expect(body.manifest.camera.fov).toBe(45);
    expect(body.manifest.quality.shadows).toBe(false); // mobile profile
    expect(body.manifest.quality.antialiasing).toBe('none');
    await app.close();
  });
});
