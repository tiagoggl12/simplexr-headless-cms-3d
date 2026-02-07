export type AssetStatus = 'draft' | 'processing' | 'ready' | 'failed';
export type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed';

// V5: Re-export new models for convenience
export * from './models/custom-fields.js';
export * from './models/workflow.js';
export * from './models/export.js';
export * from './models/analytics.js';

/**
 * Texture format metadata for V3 KTX2 compression
 */
export interface TextureFormat {
  format: 'glb' | 'ktx2' | 'basis';
  url: string;
  size: number;
  compressedSize?: number;
}

/**
 * LOD level metadata for V3 automatic LOD generation
 */
export interface LODLevel {
  level: number; // 0, 1, 2
  url: string;
  vertexCount: number;
  fileSize: number;
  distance: number; // meters - switch distance for this LOD
}

/**
 * Processing status tracking for V3 features
 */
export interface AssetProcessingStatus {
  ktx2?: ProcessingStatus;
  lods?: ProcessingStatus;
}

/**
 * 3D Asset with V2 (MaterialVariants) and V3 (KTX2/LOD) support
 */
export interface Asset3D {
  id: string;
  name: string;
  masterUrl: string;
  status: AssetStatus;
  createdAt: string;
  updatedAt: string;
  // V2: Material Variants
  hasMaterialVariants?: boolean;
  // V3: KTX2 texture compression
  textureFormats?: TextureFormat[];
  // V3: Automatic LOD generation
  lods?: LODLevel[];
  // V3: Processing status tracking
  processingStatus?: AssetProcessingStatus;
}

export interface LightingPreset {
  id: string;
  name: string;
  hdriUrl: string;
  exposure: number;
  intensity: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RenderPreset {
  id: string;
  assetId: string;
  lightingPresetId: string;
  camera: {
    fov: number;
    position: [number, number, number];
    target: [number, number, number];
  };
  createdAt: string;
  updatedAt: string;
}

export interface RenderManifest {
  version: string;
  asset: {
    id: string;
    masterUrl: string;
  };
  lighting: LightingPreset;
  camera: RenderPreset['camera'];
  qualityProfile: 'desktop' | 'mobile';
}

export type MaterialVariantStatus = 'draft' | 'processing' | 'ready' | 'failed';

export interface MaterialVariant {
  id: string;
  assetId: string;
  name: string;
  // PBR texture maps
  albedoMapUrl?: string;
  normalMapUrl?: string;
  metallicMapUrl?: string;
  roughnessMapUrl?: string;
  aoMapUrl?: string;
  emissiveMapUrl?: string;
  // PBR scalar values
  baseColor?: string; // hex color
  metallic?: number;
  roughness?: number;
  status: MaterialVariantStatus;
  createdAt: string;
}
