/**
 * Multi-Format Export Models
 * Supports export to GLTF, OBJ, USDZ, STL formats
 */

/**
 * Supported export formats
 */
export type ExportFormat = 'gltf' | 'glb' | 'obj' | 'usdz' | 'stl' | 'fbx';

/**
 * Export job status
 */
export type ExportStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

/**
 * Export options for different formats
 */
export interface ExportOptions {
  // Common options
  scale?: number;
  upAxis?: 'y' | 'z';
  applyTransforms?: boolean;

  // GLTF/GLB specific
  separateBuffers?: boolean; // GLTF only - separate .bin and textures
  embedBuffers?: boolean; // GLTF only - embed buffers in JSON
  dracoCompression?: boolean;
  textureFormat?: 'jpeg' | 'png' | 'original' | 'ktx2';
  maxTextureSize?: number;

  // OBJ specific
  includeMaterials?: boolean;
  includeNormals?: boolean;
  includeUVs?: boolean;
  mtlFile?: boolean; // Generate .mtl file
  separateObjects?: boolean; // Split by objects

  // USDZ specific
  usdzVersion?: string;
  arkitCompatible?: boolean;

  // STL specific
  binary?: boolean; // Binary STL vs ASCII
  includeColor?: boolean;

  // FBX specific
  fbxVersion?: string;
  embedMedia?: boolean;
}

/**
 * Export job
 */
export interface ExportJob {
  id: string;
  assetId: string;
  format: ExportFormat;
  options: ExportOptions;
  status: ExportStatus;
  progress: number; // 0-100
  resultUrl?: string;
  resultFiles?: ExportFile[];
  fileSize?: number;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  createdBy?: string; // User ID
}

/**
 * Export file output
 */
export interface ExportFile {
  filename: string;
  url: string;
  size: number;
  mimeType: string;
}

/**
 * Create export job request
 */
export interface CreateExportRequest {
  format: ExportFormat;
  options?: ExportOptions;
  priority?: 'low' | 'normal' | 'high';
  webhookUrl?: string; // Callback when complete
}

/**
 * Export capabilities
 */
export interface ExportCapabilities {
  format: ExportFormat;
  mimeType: string;
  extensions: string[];
  options: string[];
  maxFileSize?: number;
  estimatedTime?: number; // ms per MB
}

/**
 * Export statistics
 */
export interface ExportStatistics {
  totalJobs: number;
  byStatus: Record<ExportStatus, number>;
  byFormat: Record<ExportFormat, number>;
  avgProcessingTime: number; // milliseconds
  successRate: number; // percentage
}

/**
 * Supported export formats with their capabilities
 */
export const EXPORT_FORMATS: Record<ExportFormat, ExportCapabilities> = {
  gltf: {
    format: 'gltf',
    mimeType: 'model/gltf+json',
    extensions: ['.gltf', '.bin', '.png', '.jpg'],
    options: ['separateBuffers', 'dracoCompression', 'textureFormat', 'maxTextureSize'],
    estimatedTime: 500,
  },
  glb: {
    format: 'glb',
    mimeType: 'model/gltf-binary',
    extensions: ['.glb'],
    options: ['dracoCompression', 'textureFormat', 'maxTextureSize'],
    estimatedTime: 400,
  },
  obj: {
    format: 'obj',
    mimeType: 'model/obj',
    extensions: ['.obj', '.mtl'],
    options: ['includeMaterials', 'includeNormals', 'includeUVs', 'separateObjects'],
    estimatedTime: 300,
  },
  usdz: {
    format: 'usdz',
    mimeType: 'model/usd',
    extensions: ['.usdz'],
    options: ['arkitCompatible', 'textureFormat'],
    estimatedTime: 800,
  },
  stl: {
    format: 'stl',
    mimeType: 'model/stl',
    extensions: ['.stl'],
    options: ['binary', 'includeColor'],
    estimatedTime: 200,
  },
  fbx: {
    format: 'fbx',
    mimeType: 'model/fbx',
    extensions: ['.fbx'],
    options: ['fbxVersion', 'embedMedia'],
    estimatedTime: 600,
  },
};

/**
 * Get default options for a format
 */
export function getDefaultOptions(format: ExportFormat): ExportOptions {
  const baseOptions: ExportOptions = {
    scale: 1,
    upAxis: 'y',
    applyTransforms: true,
  };

  switch (format) {
    case 'gltf':
      return {
        ...baseOptions,
        separateBuffers: true,
        embedBuffers: false,
        dracoCompression: false,
        textureFormat: 'original',
      };

    case 'glb':
      return {
        ...baseOptions,
        dracoCompression: false,
        textureFormat: 'original',
      };

    case 'obj':
      return {
        ...baseOptions,
        includeMaterials: true,
        includeNormals: true,
        includeUVs: true,
        mtlFile: true,
        separateObjects: false,
      };

    case 'usdz':
      return {
        ...baseOptions,
        arkitCompatible: true,
        textureFormat: 'jpeg',
      };

    case 'stl':
      return {
        ...baseOptions,
        binary: true,
        includeColor: false,
      };

    case 'fbx':
      return {
        ...baseOptions,
        fbxVersion: '7.7',
        embedMedia: true,
      };

    default:
      return baseOptions;
  }
}

/**
 * Validate export options for a format
 */
export function validateExportOptions(format: ExportFormat, options: ExportOptions): string[] {
  const errors: string[] = [];
  const capabilities = EXPORT_FORMATS[format];

  if (!capabilities) {
    errors.push(`Unsupported format: ${format}`);
    return errors;
  }

  // Validate scale
  if (options.scale !== undefined) {
    if (typeof options.scale !== 'number' || options.scale <= 0) {
      errors.push('Scale must be a positive number');
    }
  }

  // Validate upAxis
  if (options.upAxis && !['y', 'z'].includes(options.upAxis)) {
    errors.push('upAxis must be either "y" or "z"');
  }

  // Format-specific validation
  switch (format) {
    case 'gltf':
      if (options.separateBuffers === false && options.embedBuffers === false) {
        errors.push('GLTF requires either separateBuffers or embedBuffers to be true');
      }
      break;

    case 'stl':
      if (options.includeColor && options.binary) {
        // Color in STL is not well-supported in binary format
        errors.push('Color in binary STL has limited support');
      }
      break;
  }

  return errors;
}

/**
 * Estimate processing time for export
 */
export function estimateProcessingTime(
  fileSize: number,
  format: ExportFormat,
  options: ExportOptions
): number {
  const capabilities = EXPORT_FORMATS[format];
  const baseTime = capabilities.estimatedTime || 500;
  const sizeMB = fileSize / (1024 * 1024);

  let multiplier = 1;

  // Adjust for format
  if (format === 'usdz') multiplier = 1.5;
  if (format === 'fbx') multiplier = 1.3;

  // Adjust for compression
  if (options.dracoCompression) multiplier *= 1.5;

  // Adjust for texture processing
  if (options.textureFormat && options.textureFormat !== 'original') {
    multiplier *= 1.2;
  }

  return Math.round(baseTime * sizeMB * multiplier);
}

/**
 * Get file extension for format
 */
export function getFileExtension(format: ExportFormat): string {
  return `.${format}`;
}
