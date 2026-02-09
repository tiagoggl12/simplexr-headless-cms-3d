/**
 * API Layer Index
 * Centralized exports for the API module
 */

// Core
export { apiClient } from './axios.js';
export { ApiError, NetworkError, ValidationError } from './axios.js';

// Endpoints
export { assetsApi, lightingApi, renderPresetsApi, uploadsApi, viewerApi } from './endpoints.js';
