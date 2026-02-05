import { Asset3D, LightingPreset, RenderPreset } from './models.js';

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

  createRenderPreset(preset: RenderPreset) {
    this.renderPresets.set(preset.id, preset);
    return preset;
  }

  getRenderPreset(id: string) {
    return this.renderPresets.get(id) ?? null;
  }
}
