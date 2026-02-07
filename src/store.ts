import { randomUUID } from 'crypto';
import { Asset3D, AssetStatus, LightingPreset, RenderPreset, MaterialVariant } from './models.js';

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
  materialVariants = new Map<string, MaterialVariant>();

  createAsset(asset: Asset3D) {
    const assetWithId = asset.id
      ? asset
      : { ...asset, id: randomUUID() };
    this.assets.set(assetWithId.id, assetWithId);
    return assetWithId;
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

  // Material Variant CRUD methods

  createMaterialVariant(data: Omit<MaterialVariant, 'id' | 'createdAt'>): MaterialVariant {
    const variant: MaterialVariant = {
      ...data,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.materialVariants.set(variant.id, variant);
    return variant;
  }

  getMaterialVariant(id: string): MaterialVariant | undefined {
    return this.materialVariants.get(id);
  }

  listMaterialVariants(assetId: string): MaterialVariant[] {
    const variants = Array.from(this.materialVariants.values());
    const filtered = variants.filter((variant) => variant.assetId === assetId);
    // Sort by createdAt descending (newest first)
    filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return filtered;
  }

  updateMaterialVariant(
    id: string,
    updates: Partial<Omit<MaterialVariant, 'id' | 'createdAt'>>
  ): MaterialVariant | undefined {
    const variant = this.materialVariants.get(id);
    if (!variant) return undefined;

    const updated: MaterialVariant = {
      ...variant,
      ...updates,
    };

    this.materialVariants.set(id, updated);
    return updated;
  }

  deleteMaterialVariant(id: string): boolean {
    return this.materialVariants.delete(id);
  }
}
