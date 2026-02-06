import { MemoryStore } from '../store.js';
import { type StorageService } from './storage.js';
import { Asset3D, LightingPreset, RenderPreset, MaterialVariant } from '../models.js';

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
 */
export class RenderManifestService {
  private readonly schemaVersion = '1.0';

  constructor(
    private readonly store: Store,
    private readonly storage: StorageService
  ) {}

  /**
   * Generate a render manifest with specified configuration.
   *
   * Resolution priority (highest to lowest):
   * 1. RenderPreset (overrides lighting and camera)
   * 2. LightingPreset (overrides default lighting)
   * 3. Defaults (fallback lighting and camera)
   *
   * @throws {Error} With code 'asset_not_found' if asset doesn't exist
   * @throws {Error} With code 'lighting_preset_not_found' if lighting preset doesn't exist
   * @throws {Error} With code 'render_preset_not_found' if render preset doesn't exist
   */
  async generate(params: GenerateParams): Promise<RenderManifest> {
    const {
      assetId,
      materialVariantId,
      lightingPresetId,
      renderPresetId,
      device = 'desktop',
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
  async generateDefault(assetId: string, device: DeviceType = 'desktop'): Promise<RenderManifest> {
    const asset = await this.store.getAsset(assetId);
    if (!asset) {
      createError('asset_not_found', `Asset with id ${assetId} not found`);
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
      version: this.schemaVersion,
      manifest,
    };
  }
}
