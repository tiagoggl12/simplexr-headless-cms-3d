import { MemoryStore } from '../store.js';
import { type StorageService } from './storage.js';
import { Asset3D, LightingPreset, RenderPreset, MaterialVariant } from '../models.js';
import { CDNService, type AssetType } from './cdn-service.js';

/**
 * Store interface for type-safe store usage
 * Both MemoryStore and PgStore implement these methods
 */
export interface Store {
  getAsset(id: string): Asset3D | null | Promise<Asset3D | null>;
  getLightingPreset(id: string): LightingPreset | null | Promise<LightingPreset | null>;
  getRenderPreset(id: string): RenderPreset | null | Promise<RenderPreset | null>;
  getMaterialVariant?(id: string): MaterialVariant | null | undefined | Promise<MaterialVariant | null | undefined>;
}

/**
 * Render Manifest Schema v1.0
 *
 * Versioned schema for forward compatibility with 3D viewers.
 * Viewers should check the version field to ensure compatibility.
 */
export interface RenderManifest {
  version: string; // "1.0"
  manifest: {
    asset: {
      id: string;
      name: string;
      url: string;
      format: 'glb';
    };
    material?: {
      id: string;
      name: string;
      pbr: {
        albedoMap?: string;
        normalMap?: string;
        metallicMap?: string;
        roughnessMap?: string;
        aoMap?: string;
        emissiveMap?: string;
        baseColor?: string;
        metallic?: number;
        roughness?: number;
      };
    };
    lighting: {
      id: string;
      name: string;
      hdri: string;
      exposure: number;
      intensity: number;
    };
    camera: {
      position: [number, number, number];
      target: [number, number, number];
      fov: number;
    };
    quality: {
      shadows: boolean;
      antialiasing: string;
      tonemapping: string;
    };
  };
}

/**
 * LOD info for v2.0 manifest
 */
export interface ManifestLOD {
  level: number;
  url: string;
  distance: number;
  vertexCount?: number;
  fileSize?: number;
}

/**
 * Asset formats for v2.0 manifest
 */
export interface ManifestFormats {
  primary: string;
  ktx2?: string;
  lods?: ManifestLOD[];
}

/**
 * Device capabilities for v2.0 manifest
 */
export interface ManifestCapabilities {
  ktx2: boolean;
  lods: boolean;
  maxLodLevel?: number;
}

/**
 * Render Manifest Schema v2.0
 *
 * Extends v1.0 with KTX2 textures, LOD levels, and CDN support.
 * Maintains backward compatibility with v1.0 viewers.
 */
export interface RenderManifestV2 {
  version: '2.0';
  manifest: {
    asset: {
      id: string;
      name: string;
      url: string;
      format: 'glb';
      formats?: ManifestFormats;
      capabilities?: ManifestCapabilities;
    };
    material?: {
      id: string;
      name: string;
      pbr: {
        albedoMap?: string;
        normalMap?: string;
        metallicMap?: string;
        roughnessMap?: string;
        aoMap?: string;
        emissiveMap?: string;
        baseColor?: string;
        metallic?: number;
        roughness?: number;
      };
    };
    lighting: {
      id: string;
      name: string;
      hdri: string;
      exposure: number;
      intensity: number;
    };
    camera: {
      position: [number, number, number];
      target: [number, number, number];
      fov: number;
    };
    quality: {
      shadows: boolean;
      antialiasing: string;
      tonemapping: string;
    };
  };
}

/**
 * Union type for both manifest versions
 */
export type RenderManifestUnion = RenderManifest | RenderManifestV2;

/**
 * Quality profiles for different device types
 */
const QUALITY_PROFILES = {
  desktop: {
    shadows: true,
    antialiasing: 'fxaa',
    tonemapping: 'aces',
  },
  mobile: {
    shadows: false,
    antialiasing: 'none',
    tonemapping: 'linear',
  },
} as const;

/**
 * Default lighting preset used when no preset is specified
 */
const DEFAULT_LIGHTING: LightingPreset = {
  id: 'default',
  name: 'Default Lighting',
  hdriUrl: 'https://hdri.example.com/default.hdr',
  exposure: 1.0,
  intensity: 1.0,
  tags: ['default'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/**
 * Default camera configuration
 */
const DEFAULT_CAMERA = {
  fov: 45,
  position: [3, 3, 3] as [number, number, number],
  target: [0, 0, 0] as [number, number, number],
};

export type DeviceType = 'mobile' | 'desktop';

interface GenerateParams {
  assetId: string;
  materialVariantId?: string;
  lightingPresetId?: string;
  renderPresetId?: string;
  device?: DeviceType;
  // V3: New options for v2.0 manifest
  format?: 'glb' | 'ktx2'; // Preferred texture format
  maxLod?: number; // Maximum LOD level to include
  preferKtx2?: boolean; // Prefer KTX2 if available
  userAgent?: string; // For device capability detection
}

interface GenerateError extends Error {
  statusCode?: number;
  code?: string;
}

function createError(code: string, message: string, statusCode = 404): never {
  const err: GenerateError = new Error(message) as GenerateError;
  err.code = code;
  err.statusCode = statusCode;
  throw err;
}

/**
 * RenderManifestService generates resolved viewer configurations.
 *
 * Combines Asset3D + MaterialVariant (optional) + LightingPreset + RenderPreset
 * into a single manifest that viewers can consume directly.
 *
 * V3: Supports v2.0 manifest with KTX2 textures, LOD levels, and CDN URLs.
 */
export class RenderManifestService {
  private readonly schemaVersion = '2.0';

  constructor(
    private readonly store: Store,
    private readonly storage: StorageService,
    private readonly cdnService?: CDNService
  ) { }

  /**
   * Generate a render manifest with specified configuration.
   *
   * Resolution priority (highest to lowest):
   * 1. RenderPreset (overrides lighting and camera)
   * 2. LightingPreset (overrides default lighting)
   * 3. Defaults (fallback lighting and camera)
   *
   * V3: Supports KTX2, LOD, and CDN features via query parameters.
   *
   * @throws {Error} With code 'asset_not_found' if asset doesn't exist
   * @throws {Error} With code 'lighting_preset_not_found' if lighting preset doesn't exist
   * @throws {Error} With code 'render_preset_not_found' if render preset doesn't exist
   */
  async generate(params: GenerateParams): Promise<RenderManifestUnion> {
    const {
      assetId,
      materialVariantId,
      lightingPresetId,
      renderPresetId,
      device = 'desktop',
      format,
      maxLod,
      preferKtx2 = false,
      userAgent,
    } = params;

    // Fetch and validate asset
    const asset = await this.store.getAsset(assetId);
    if (!asset) {
      createError('asset_not_found', `Asset with id ${assetId} not found`);
    }

    // Fetch material variant if specified
    let materialVariant: MaterialVariant | undefined;
    if (materialVariantId) {
      const variant = await this.store.getMaterialVariant?.(materialVariantId);
      if (!variant) {
        createError('material_variant_not_found', `Material variant with id ${materialVariantId} not found`);
      }
      if (variant.assetId !== assetId) {
        createError('invalid_material_variant', `Material variant ${materialVariantId} is for a different asset`, 400);
      }
      materialVariant = variant;
    }

    // Resolve lighting preset
    let lighting: LightingPreset;
    let camera: RenderPreset['camera'];

    if (renderPresetId) {
      // Use render preset configuration
      const renderPreset = await this.store.getRenderPreset(renderPresetId);
      if (!renderPreset) {
        createError('render_preset_not_found', `Render preset with id ${renderPresetId} not found`);
      }

      // Validate asset matches
      if (renderPreset.assetId !== assetId) {
        createError('invalid_render_preset', `Render preset ${renderPresetId} is for a different asset`, 400);
      }

      const presetLighting = await this.store.getLightingPreset(renderPreset.lightingPresetId);
      if (!presetLighting) {
        createError('lighting_preset_not_found', `Lighting preset ${renderPreset.lightingPresetId} referenced by render preset not found`);
      }

      lighting = presetLighting;
      camera = renderPreset.camera;
    } else if (lightingPresetId) {
      // Use standalone lighting preset with default camera
      const presetLighting = await this.store.getLightingPreset(lightingPresetId);
      if (!presetLighting) {
        createError('lighting_preset_not_found', `Lighting preset with id ${lightingPresetId} not found`);
      }

      lighting = presetLighting;
      camera = DEFAULT_CAMERA;
    } else {
      // Use defaults
      lighting = DEFAULT_LIGHTING;
      camera = DEFAULT_CAMERA;
    }

    // Check if we should use v2.0 manifest (V3 features requested)
    const useV2 = format === 'ktx2' || maxLod !== undefined || preferKtx2 ||
      (asset.lods && asset.lods.length > 0) ||
      (asset.textureFormats && asset.textureFormats.length > 0);

    if (useV2) {
      return this.buildManifestV2({
        asset,
        materialVariant,
        lighting,
        camera,
        quality: QUALITY_PROFILES[device],
        format,
        maxLod,
        preferKtx2,
        userAgent,
      });
    }

    return this.buildManifest({
      asset,
      materialVariant,
      lighting,
      camera,
      quality: QUALITY_PROFILES[device],
    });
  }

  /**
   * Generate a render manifest with default configuration.
   * Uses default lighting, camera, and desktop quality profile.
   *
   * @throws {Error} With code 'asset_not_found' if asset doesn't exist
   */
  async generateDefault(
    assetId: string,
    device: DeviceType = 'desktop',
    options?: { format?: 'glb' | 'ktx2'; maxLod?: number }
  ): Promise<RenderManifestUnion> {
    const asset = await this.store.getAsset(assetId);
    if (!asset) {
      createError('asset_not_found', `Asset with id ${assetId} not found`);
    }

    // Check if we should use v2.0 manifest
    const useV2 = options?.format === 'ktx2' || options?.maxLod !== undefined ||
      (asset.lods && asset.lods.length > 0) ||
      (asset.textureFormats && asset.textureFormats.length > 0);

    if (useV2) {
      return this.buildManifestV2({
        asset,
        lighting: DEFAULT_LIGHTING,
        camera: DEFAULT_CAMERA,
        quality: QUALITY_PROFILES[device],
        format: options?.format,
        maxLod: options?.maxLod,
      });
    }

    return this.buildManifest({
      asset,
      lighting: DEFAULT_LIGHTING,
      camera: DEFAULT_CAMERA,
      quality: QUALITY_PROFILES[device],
    });
  }

  /**
   * Build the final manifest object from resolved components
   */
  private buildManifest(params: {
    asset: Asset3D;
    materialVariant?: MaterialVariant;
    lighting: LightingPreset;
    camera: RenderPreset['camera'];
    quality: typeof QUALITY_PROFILES[DeviceType];
  }): RenderManifest {
    const { asset, materialVariant, lighting, camera, quality } = params;

    const manifest: RenderManifest['manifest'] = {
      asset: {
        id: asset.id,
        name: asset.name,
        url: asset.masterUrl,
        format: 'glb',
      },
      lighting: {
        id: lighting.id,
        name: lighting.name,
        hdri: lighting.hdriUrl,
        exposure: lighting.exposure,
        intensity: lighting.intensity,
      },
      camera: {
        position: camera.position,
        target: camera.target,
        fov: camera.fov,
      },
      quality: {
        shadows: quality.shadows,
        antialiasing: quality.antialiasing,
        tonemapping: quality.tonemapping,
      },
    };

    // Add material variant if specified
    if (materialVariant) {
      manifest.material = {
        id: materialVariant.id,
        name: materialVariant.name,
        pbr: {
          albedoMap: materialVariant.albedoMapUrl,
          normalMap: materialVariant.normalMapUrl,
          metallicMap: materialVariant.metallicMapUrl,
          roughnessMap: materialVariant.roughnessMapUrl,
          aoMap: materialVariant.aoMapUrl,
          emissiveMap: materialVariant.emissiveMapUrl,
          baseColor: materialVariant.baseColor,
          metallic: materialVariant.metallic,
          roughness: materialVariant.roughness,
        },
      };
    }

    return {
      version: '1.0',
      manifest,
    };
  }

  /**
   * Build a v2.0 manifest with KTX2, LOD, and CDN support
   */
  private buildManifestV2(params: {
    asset: Asset3D;
    materialVariant?: MaterialVariant;
    lighting: LightingPreset;
    camera: RenderPreset['camera'];
    quality: typeof QUALITY_PROFILES[DeviceType];
    format?: 'glb' | 'ktx2';
    maxLod?: number;
    preferKtx2?: boolean;
    userAgent?: string;
  }): RenderManifestV2 {
    const { asset, materialVariant, lighting, camera, quality, format, maxLod, preferKtx2, userAgent } = params;

    // Determine primary URL and format
    let primaryUrl = asset.masterUrl;
    let primaryFormat = 'glb' as const;

    // Apply CDN transformation if available
    if (this.cdnService) {
      primaryUrl = this.cdnService.transformUrl(asset.masterUrl, 'glb');
    }

    // Build formats object
    const formats: ManifestFormats = {
      primary: primaryUrl,
    };

    // Add KTX2 format if available and requested
    if (asset.textureFormats && asset.textureFormats.length > 0) {
      const ktx2Format = asset.textureFormats.find(f => f.format === 'ktx2');
      if (ktx2Format && (preferKtx2 || format === 'ktx2')) {
        let ktx2Url = ktx2Format.url;
        if (this.cdnService) {
          ktx2Url = this.cdnService.transformUrl(ktx2Url, 'ktx2');
        }
        formats.ktx2 = ktx2Url;
        primaryFormat = 'ktx2' as 'glb';
      }
    }

    // Add LODs if available
    if (asset.lods && asset.lods.length > 0) {
      const maxLevel = maxLod !== undefined ? Math.min(maxLod, asset.lods.length - 1) : asset.lods.length - 1;
      const filteredLods = asset.lods.filter(lod => lod.level <= maxLevel);

      formats.lods = filteredLods.map(lod => ({
        level: lod.level,
        url: this.cdnService ? this.cdnService.transformUrl(lod.url, 'lod') : lod.url,
        distance: lod.distance,
        vertexCount: lod.vertexCount,
        fileSize: lod.fileSize,
      }));
    }

    // Determine device capabilities
    const capabilities: ManifestCapabilities = {
      ktx2: !!(asset.textureFormats && asset.textureFormats.some(f => f.format === 'ktx2')),
      lods: !!(asset.lods && asset.lods.length > 0),
      maxLodLevel: asset.lods ? asset.lods.length - 1 : undefined,
    };

    const manifest: RenderManifestV2['manifest'] = {
      asset: {
        id: asset.id,
        name: asset.name,
        url: primaryUrl,
        format: primaryFormat,
        formats,
        capabilities,
      },
      lighting: {
        id: lighting.id,
        name: lighting.name,
        hdri: lighting.hdriUrl,
        exposure: lighting.exposure,
        intensity: lighting.intensity,
      },
      camera: {
        position: camera.position,
        target: camera.target,
        fov: camera.fov,
      },
      quality: {
        shadows: quality.shadows,
        antialiasing: quality.antialiasing,
        tonemapping: quality.tonemapping,
      },
    };

    // Add material variant if specified
    if (materialVariant) {
      manifest.material = {
        id: materialVariant.id,
        name: materialVariant.name,
        pbr: {
          albedoMap: materialVariant.albedoMapUrl,
          normalMap: materialVariant.normalMapUrl,
          metallicMap: materialVariant.metallicMapUrl,
          roughnessMap: materialVariant.roughnessMapUrl,
          aoMap: materialVariant.aoMapUrl,
          emissiveMap: materialVariant.emissiveMapUrl,
          baseColor: materialVariant.baseColor,
          metallic: materialVariant.metallic,
          roughness: materialVariant.roughness,
        },
      };
    }

    return {
      version: '2.0',
      manifest,
    };
  }
}
