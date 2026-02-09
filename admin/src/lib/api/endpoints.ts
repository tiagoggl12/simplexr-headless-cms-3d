/**
 * API Endpoints for SimpleXR DAM Admin
 * Centralized endpoint definitions for type-safe API calls
 */

import { apiClient } from './axios';
import {
  ApiError,
  NetworkError,
  ValidationError,
} from './axios';
import type {
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
} from '../types';

// Helper function to handle API errors
async function handleApiCall<T>(
  call: () => Promise<T>,
  errorMessage: string = 'An error occurred'
): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (
      error instanceof ValidationError ||
      error instanceof ApiError ||
      error instanceof NetworkError
    ) {
      throw error;
    }
    throw new ApiError(errorMessage, 500, 'unknown_error');
  }
}

// ===== Assets API =====
export const assetsApi = {
  list: async (params?: AssetListParams): Promise<PaginatedResponse<Asset3D>> => {
    return handleApiCall(async () => {
      const searchParams = new URLSearchParams();
      if (params?.status) searchParams.set('status', params.status);
      if (params?.limit) searchParams.set('limit', params.limit.toString());
      if (params?.offset) searchParams.set('offset', params.offset.toString());
      
      const query = searchParams.toString();
      const url = `/assets${query ? `?${query}` : ''}`;
      
      const response = await apiClient.get<PaginatedResponse<Asset3D>>(url);
      return response.data;
    }, 'Failed to fetch assets');
  },

  get: async (id: string): Promise<Asset3D> => {
    return handleApiCall(async () => {
      const response = await apiClient.get<Asset3D>(`/assets/${id}`);
      return response.data;
    }, 'Failed to fetch asset');
  },

  create: async (data: CreateAssetDto): Promise<Asset3D> => {
    return handleApiCall(async () => {
      const response = await apiClient.post<Asset3D>('/assets', data);
      return response.data;
    }, 'Failed to create asset');
  },

  update: async (id: string, data: UpdateAssetDto): Promise<Asset3D> => {
    return handleApiCall(async () => {
      const response = await apiClient.patch<Asset3D>(`/assets/${id}`, data);
      return response.data;
    }, 'Failed to update asset');
  },

  delete: async (id: string): Promise<void> => {
    return handleApiCall(async () => {
      await apiClient.delete(`/assets/${id}`);
    }, 'Failed to delete asset');
  },
};

// ===== Lighting Presets API =====
export const lightingApi = {
  list: async (tag?: string): Promise<PaginatedResponse<LightingPreset>> => {
    return handleApiCall(async () => {
      const url = tag ? `/presets/lighting?tag=${encodeURIComponent(tag)}` : '/presets/lighting';
      const response = await apiClient.get<PaginatedResponse<LightingPreset>>(url);
      return response.data;
    }, 'Failed to fetch lighting presets');
  },

  get: async (id: string): Promise<LightingPreset> => {
    return handleApiCall(async () => {
      const response = await apiClient.get<LightingPreset>(`/presets/lighting/${id}`);
      return response.data;
    }, 'Failed to fetch lighting preset');
  },

  create: async (data: CreateLightingPresetDto): Promise<LightingPreset> => {
    return handleApiCall(async () => {
      const response = await apiClient.post<LightingPreset>('/presets/lighting', data);
      return response.data;
    }, 'Failed to create lighting preset');
  },

  update: async (id: string, data: UpdateLightingPresetDto): Promise<LightingPreset> => {
    return handleApiCall(async () => {
      const response = await apiClient.patch<LightingPreset>(`/presets/lighting/${id}`, data);
      return response.data;
    }, 'Failed to update lighting preset');
  },

  delete: async (id: string): Promise<void> => {
    return handleApiCall(async () => {
      await apiClient.delete(`/presets/lighting/${id}`);
    }, 'Failed to delete lighting preset');
  },
};

// ===== Render Presets API =====
export const renderPresetsApi = {
  list: async (assetId?: string): Promise<PaginatedResponse<RenderPreset>> => {
    return handleApiCall(async () => {
      const url = assetId ? `/presets/render?assetId=${assetId}` : '/presets/render';
      const response = await apiClient.get<PaginatedResponse<RenderPreset>>(url);
      return response.data;
    }, 'Failed to fetch render presets');
  },

  get: async (id: string): Promise<RenderPreset> => {
    return handleApiCall(async () => {
      const response = await apiClient.get<RenderPreset>(`/presets/render/${id}`);
      return response.data;
    }, 'Failed to fetch render preset');
  },

  create: async (data: CreateRenderPresetDto): Promise<RenderPreset> => {
    return handleApiCall(async () => {
      const response = await apiClient.post<RenderPreset>('/presets/render', data);
      return response.data;
    }, 'Failed to create render preset');
  },

  delete: async (id: string): Promise<void> => {
    return handleApiCall(async () => {
      await apiClient.delete(`/presets/render/${id}`);
    }, 'Failed to delete render preset');
  },
};

// ===== Uploads API =====
export const uploadsApi = {
  presign: async (path: string): Promise<PresignUploadResponse> => {
    return handleApiCall(async () => {
      const response = await apiClient.post<PresignUploadResponse>('/uploads/presign', { path });
      return response.data;
    }, 'Failed to generate presigned URL');
  },
};

// ===== Viewer API =====
export const viewerApi = {
  getAsset: async (assetId: string): Promise<{ assetId: string; masterUrl: string; status: string }> => {
    return handleApiCall(async () => {
      const response = await apiClient.get<{ assetId: string; masterUrl: string; status: string }>(
        `/viewer/assets/${assetId}`
      );
      return response.data;
    }, 'Failed to fetch viewer asset');
  },

  getPresets: async (tag?: string): Promise<{ items: LightingPreset[] }> => {
    return handleApiCall(async () => {
      const url = tag ? `/viewer/presets?tag=${encodeURIComponent(tag)}` : '/viewer/presets';
      const response = await apiClient.get<{ items: LightingPreset[] }>(url);
      return response.data;
    }, 'Failed to fetch viewer presets');
  },
};

// Export error types for convenience
export { ApiError, NetworkError, ValidationError };
