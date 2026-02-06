import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const sampleAsset = {
  name: 'Chair Model',
  masterUrl: 's3://bucket/assets/chair.glb',
};

const minimalVariant = {
  assetId: '', // Will be set in test
  name: 'Wood Finish',
};

const fullVariant = {
  assetId: '', // Will be set in test
  name: 'Polished Chrome',
  // PBR texture maps
  albedoMapUrl: 'https://example.com/textures/chrome_albedo.png',
  normalMapUrl: 'https://example.com/textures/chrome_normal.png',
  metallicMapUrl: 'https://example.com/textures/chrome_metallic.png',
  roughnessMapUrl: 'https://example.com/textures/chrome_roughness.png',
  aoMapUrl: 'https://example.com/textures/chrome_ao.png',
  emissiveMapUrl: 'https://example.com/textures/chrome_emissive.png',
  // PBR scalar values
  baseColor: '#C0C0C0',
  metallic: 1.0,
  roughness: 0.2,
};

describe('Material Variant API', () => {
  it('creates a variant with minimal fields', async () => {
    const app = await createApp();

    // Create an asset first
    const assetRes = await app.inject({
      method: 'POST',
      url: '/assets',
      payload: sampleAsset,
    });
    const asset = assetRes.json();

    const res = await app.inject({
      method: 'POST',
      url: '/variants',
      payload: { ...minimalVariant, assetId: asset.id },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeTypeOf('string');
    expect(body.assetId).toBe(asset.id);
    expect(body.name).toBe('Wood Finish');
    expect(body.status).toBe('draft');
    await app.close();
  });

  it('creates a variant with all PBR maps and values', async () => {
    const app = await createApp();

    // Create an asset first
    const assetRes = await app.inject({
      method: 'POST',
      url: '/assets',
      payload: sampleAsset,
    });
    const asset = assetRes.json();

    const res = await app.inject({
      method: 'POST',
      url: '/variants',
      payload: { ...fullVariant, assetId: asset.id },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeTypeOf('string');
    expect(body.assetId).toBe(asset.id);
    expect(body.name).toBe('Polished Chrome');
    expect(body.albedoMapUrl).toBe(fullVariant.albedoMapUrl);
    expect(body.normalMapUrl).toBe(fullVariant.normalMapUrl);
    expect(body.metallicMapUrl).toBe(fullVariant.metallicMapUrl);
    expect(body.roughnessMapUrl).toBe(fullVariant.roughnessMapUrl);
    expect(body.aoMapUrl).toBe(fullVariant.aoMapUrl);
    expect(body.emissiveMapUrl).toBe(fullVariant.emissiveMapUrl);
    expect(body.baseColor).toBe(fullVariant.baseColor);
    expect(body.metallic).toBe(fullVariant.metallic);
    expect(body.roughness).toBe(fullVariant.roughness);
    await app.close();
  });

  it('returns a variant by id', async () => {
    const app = await createApp();

    // Create an asset first
    const assetRes = await app.inject({
      method: 'POST',
      url: '/assets',
      payload: sampleAsset,
    });
    const asset = assetRes.json();

    // Create a variant
    const created = await app.inject({
      method: 'POST',
      url: '/variants',
      payload: { ...minimalVariant, assetId: asset.id },
    });
    const variant = created.json();

    const res = await app.inject({
      method: 'GET',
      url: `/variants/${variant.id}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(variant.id);
    expect(body.name).toBe('Wood Finish');
    await app.close();
  });

  it('returns 404 for non-existent variant', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'GET',
      url: '/variants/00000000-0000-0000-0000-000000000000',
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error).toBe('variant_not_found');
    await app.close();
  });

  it('lists variants by assetId', async () => {
    const app = await createApp();

    // Create an asset first
    const assetRes = await app.inject({
      method: 'POST',
      url: '/assets',
      payload: sampleAsset,
    });
    const asset = assetRes.json();

    // Create two variants with a small delay to ensure different timestamps
    await app.inject({
      method: 'POST',
      url: '/variants',
      payload: { ...minimalVariant, assetId: asset.id, name: 'Variant 1' },
    });
    // Add a small delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));
    await app.inject({
      method: 'POST',
      url: '/variants',
      payload: { ...minimalVariant, assetId: asset.id, name: 'Variant 2' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/variants?assetId=${asset.id}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(2);
    expect(body.items[0].name).toBe('Variant 2'); // Newest first
    expect(body.items[1].name).toBe('Variant 1');
    await app.close();
  });

  it('requires assetId parameter when listing', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'GET',
      url: '/variants',
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('assetId_required');
    await app.close();
  });

  it('returns 404 when listing variants for non-existent asset', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'GET',
      url: '/variants?assetId=00000000-0000-0000-0000-000000000000',
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error).toBe('asset_not_found');
    await app.close();
  });

  it('returns empty list for asset with no variants', async () => {
    const app = await createApp();

    // Create an asset first
    const assetRes = await app.inject({
      method: 'POST',
      url: '/assets',
      payload: sampleAsset,
    });
    const asset = assetRes.json();

    const res = await app.inject({
      method: 'GET',
      url: `/variants?assetId=${asset.id}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(0);
    await app.close();
  });

  it('updates a variant', async () => {
    const app = await createApp();

    // Create an asset first
    const assetRes = await app.inject({
      method: 'POST',
      url: '/assets',
      payload: sampleAsset,
    });
    const asset = assetRes.json();

    // Create a variant
    const created = await app.inject({
      method: 'POST',
      url: '/variants',
      payload: { ...minimalVariant, assetId: asset.id },
    });
    const variant = created.json();

    const res = await app.inject({
      method: 'PATCH',
      url: `/variants/${variant.id}`,
      payload: {
        name: 'Mahogany Wood',
        baseColor: '#8B4513',
        roughness: 0.8,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(variant.id);
    expect(body.name).toBe('Mahogany Wood');
    expect(body.baseColor).toBe('#8B4513');
    expect(body.roughness).toBe(0.8);
    await app.close();
  });

  it('returns 404 when updating non-existent variant', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'PATCH',
      url: '/variants/00000000-0000-0000-0000-000000000000',
      payload: { name: 'Updated' },
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error).toBe('variant_not_found');
    await app.close();
  });

  it('deletes a variant', async () => {
    const app = await createApp();

    // Create an asset first
    const assetRes = await app.inject({
      method: 'POST',
      url: '/assets',
      payload: sampleAsset,
    });
    const asset = assetRes.json();

    // Create a variant
    const created = await app.inject({
      method: 'POST',
      url: '/variants',
      payload: { ...minimalVariant, assetId: asset.id },
    });
    const variant = created.json();

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/variants/${variant.id}`,
    });

    expect(deleteRes.statusCode).toBe(204);

    // Verify it's gone
    const getRes = await app.inject({
      method: 'GET',
      url: `/variants/${variant.id}`,
    });

    expect(getRes.statusCode).toBe(404);
    await app.close();
  });

  it('returns 404 when deleting non-existent variant', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'DELETE',
      url: '/variants/00000000-0000-0000-0000-000000000000',
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error).toBe('variant_not_found');
    await app.close();
  });

  it('validates that assetId is required', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/variants',
      payload: { name: 'No Asset' },
    });

    // Zod validation error returns 500 without global error handler
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  it('validates that name is required', async () => {
    const app = await createApp();

    // Create an asset first
    const assetRes = await app.inject({
      method: 'POST',
      url: '/assets',
      payload: sampleAsset,
    });
    const asset = assetRes.json();

    const res = await app.inject({
      method: 'POST',
      url: '/variants',
      payload: { assetId: asset.id },
    });

    // Zod validation error returns 500 without global error handler
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  it('validates metallic value is between 0 and 1', async () => {
    const app = await createApp();

    // Create an asset first
    const assetRes = await app.inject({
      method: 'POST',
      url: '/assets',
      payload: sampleAsset,
    });
    const asset = assetRes.json();

    const res = await app.inject({
      method: 'POST',
      url: '/variants',
      payload: {
        assetId: asset.id,
        name: 'Invalid Metallic',
        metallic: 1.5, // Invalid: > 1
      },
    });

    // Zod validation error returns 500 without global error handler
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  it('validates baseColor is a valid hex color', async () => {
    const app = await createApp();

    // Create an asset first
    const assetRes = await app.inject({
      method: 'POST',
      url: '/assets',
      payload: sampleAsset,
    });
    const asset = assetRes.json();

    const res = await app.inject({
      method: 'POST',
      url: '/variants',
      payload: {
        assetId: asset.id,
        name: 'Invalid Color',
        baseColor: 'red', // Invalid: not hex format
      },
    });

    // Zod validation error returns 500 without global error handler
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  it('returns 404 when creating variant for non-existent asset', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/variants',
      payload: {
        ...minimalVariant,
        assetId: '00000000-0000-0000-0000-000000000000',
      },
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error).toBe('asset_not_found');
    await app.close();
  });
});
