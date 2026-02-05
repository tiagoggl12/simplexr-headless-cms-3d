import {
  Asset3D,
  AssetListParams,
  CreateAssetDto,
  UpdateAssetDto,
  LightingPreset,
  CreateLightingPresetDto,
  UpdateLightingPresetDto,
  RenderPreset,
  CreateRenderPresetDto,
  PaginatedResponse,
  PresignUploadResponse,
} from './types.js';

const API_BASE = '';

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || error.message || `HTTP ${response.status}`);
  }

  // For 204 No Content, return undefined
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// ===== Assets API =====
export const assetsApi = {
  list: (params?: AssetListParams) =>
    request<PaginatedResponse<Asset3D>>(
      `/assets${params ? '?' + new URLSearchParams({
        ...(params.status && { status: params.status }),
        ...(params.limit && { limit: params.limit.toString() }),
        ...(params.offset && { offset: params.offset.toString() }),
      }) : ''}`
    ),

  get: (id: string) =>
    request<Asset3D>(`/assets/${id}`),

  create: (data: CreateAssetDto) =>
    request<Asset3D>('/assets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: UpdateAssetDto) =>
    request<Asset3D>(`/assets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request(`/assets/${id}`, {
      method: 'DELETE',
    }),
};

// ===== Lighting Presets API =====
export const lightingApi = {
  list: (tag?: string) =>
    request<PaginatedResponse<LightingPreset>>(
      `/presets/lighting${tag ? `?tag=${encodeURIComponent(tag)}` : ''}`
    ),

  get: (id: string) =>
    request<LightingPreset>(`/presets/lighting/${id}`),

  create: (data: CreateLightingPresetDto) =>
    request<LightingPreset>('/presets/lighting', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: UpdateLightingPresetDto) =>
    request<LightingPreset>(`/presets/lighting/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request(`/presets/lighting/${id}`, {
      method: 'DELETE',
    }),
};

// ===== Render Presets API =====
export const renderPresetsApi = {
  list: (assetId?: string) =>
    request<PaginatedResponse<RenderPreset>>(
      `/presets/render${assetId ? `?assetId=${assetId}` : ''}`
    ),

  get: (id: string) =>
    request<RenderPreset>(`/presets/render/${id}`),

  create: (data: CreateRenderPresetDto) =>
    request<RenderPreset>('/presets/render', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request(`/presets/render/${id}`, {
      method: 'DELETE',
    }),
};

// ===== Uploads API =====
export const uploadsApi = {
  presign: (path: string) =>
    request<PresignUploadResponse>('/uploads/presign', {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),
};

// ===== Viewer API (for admin use) =====
export const viewerApi = {
  getAsset: (assetId: string) =>
    request<{ assetId: string; masterUrl: string; status: string }>(
      `/viewer/assets/${assetId}`
    ),

  getPresets: (tag?: string) =>
    request<{ items: LightingPreset }>(
      `/viewer/presets${tag ? `?tag=${encodeURIComponent(tag)}` : ''}`
    ),
};
