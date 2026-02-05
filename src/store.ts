import { Asset3D, AssetStatus, LightingPreset, RenderPreset } from './models.js';

interface ListOptions {
  status?: AssetStatus;
  limit?: number;
  offset?: number;
  assetId?: string;
}

export class MemoryStore {
  assets = new Map<string, Asset3D>();
  lightingPresets = new Map<string, LightingPreset>();
  renderPresets = new Map<string, RenderPreset>();

  createAsset(asset: Asset3D) {
    this.assets.set(asset.id, asset);
    return asset;
  }

  getAsset(id: string) {
    return this.assets.get(id) ?? null;
  }

  listAssets(options?: ListOptions) {
    let assets = Array.from(this.assets.values());

    if (options?.status) {
      assets = assets.filter((asset) => asset.status === options.status);
    }

    // Sort by createdAt descending (newest first)
    assets.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? assets.length;

    return {
      items: assets.slice(offset, offset + limit),
      total: assets.length,
      offset,
      limit,
    };
  }

  updateAsset(id: string, updates: Partial<Omit<Asset3D, 'id' | 'createdAt'>>) {
    const asset = this.assets.get(id);
    if (!asset) return null;

    const updated: Asset3D = {
      ...asset,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.assets.set(id, updated);
    return updated;
  }

  deleteAsset(id: string) {
    return this.assets.delete(id);
  }

  createLightingPreset(preset: LightingPreset) {
    this.lightingPresets.set(preset.id, preset);
    return preset;
  }

  listLightingPresets(tag?: string) {
    const presets = Array.from(this.lightingPresets.values());
    if (!tag) return presets;
    return presets.filter((preset) => preset.tags.includes(tag));
  }

  getLightingPreset(id: string) {
    return this.lightingPresets.get(id) ?? null;
  }

  updateLightingPreset(id: string, updates: Partial<Omit<LightingPreset, 'id' | 'createdAt'>>) {
    const preset = this.lightingPresets.get(id);
    if (!preset) return null;

    const updated: LightingPreset = {
      ...preset,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.lightingPresets.set(id, updated);
    return updated;
  }

  deleteLightingPreset(id: string) {
    return this.lightingPresets.delete(id);
  }

  createRenderPreset(preset: RenderPreset) {
    this.renderPresets.set(preset.id, preset);
    return preset;
  }

  listRenderPresets(options?: { assetId?: string }) {
    let presets = Array.from(this.renderPresets.values());

    if (options?.assetId) {
      presets = presets.filter((preset) => preset.assetId === options.assetId);
    }

    // Sort by createdAt descending
    presets.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return presets;
  }

  getRenderPreset(id: string) {
    return this.renderPresets.get(id) ?? null;
  }

  deleteRenderPreset(id: string) {
    return this.renderPresets.delete(id);
  }
}
