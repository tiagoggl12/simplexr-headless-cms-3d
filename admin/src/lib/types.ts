// Types matching the backend models
export type AssetStatus = 'draft' | 'processing' | 'ready' | 'failed';

export interface AssetThumbnail {
  url: string;
  width: number;
  height: number;
}

export interface Asset3D {
  id: string;
  name: string;
  masterUrl: string;
  status: AssetStatus;
  createdAt: string;
  updatedAt: string;
  // Optional enriched fields
  thumbnails?: Record<string, AssetThumbnail>;
  thumbnailUrl?: string;
  fileSize?: number;
  tags?: string[];
  description?: string;
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
  // Enriched fields from API
  assetName?: string;
  lightingPresetName?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total?: number;
  offset?: number;
  limit?: number;
}

export interface AssetListParams {
  status?: AssetStatus;
  limit?: number;
  offset?: number;
}

export interface CreateAssetDto {
  name: string;
  masterUrl: string;
}

export interface UpdateAssetDto {
  name?: string;
  status?: AssetStatus;
}

export interface CreateLightingPresetDto {
  name: string;
  hdriUrl: string;
  exposure: number;
  intensity: number;
  tags?: string[];
}

export interface UpdateLightingPresetDto {
  name?: string;
  hdriUrl?: string;
  exposure?: number;
  intensity?: number;
  tags?: string[];
}

export interface CreateRenderPresetDto {
  assetId: string;
  lightingPresetId: string;
  camera: {
    fov: number;
    position: [number, number, number];
    target: [number, number, number];
  };
}

export interface PresignUploadResponse {
  uploadUrl: string;
  fileUrl: string;
}
