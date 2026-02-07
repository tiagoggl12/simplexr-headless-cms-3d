import { NodeIO, Document, Primitive, Accessor } from '@gltf-transform/core';
import { weld, prune, dedup, simplify } from '@gltf-transform/functions';
import type { LODLevel } from '../models.js';

// Lazy-load MeshoptSimplifier (optional dependency)
let MeshoptSimplifier: any = undefined;
try {
  MeshoptSimplifier = (await import('meshoptimizer')).MeshoptSimplifier;
} catch {
  // meshoptimizer is optional - LOD generation will work but without simplification
  console.warn('[LOD] meshoptimizer not installed - LODs will not be simplified');
}

/**
 * LOD level configuration
 */
export interface LODLevelConfig {
  level: number;
  ratio: number; // 0.5 = 50% vertices retained
  error: number; // Simplification error tolerance
  distance: number; // Distance in meters for this LOD
}

/**
 * Default LOD configurations
 */
export const DEFAULT_LOD_CONFIGS: LODLevelConfig[] = [
  { level: 0, ratio: 1.0, error: 0.0, distance: 0 },    // LOD0: Full detail (0-10m)
  { level: 1, ratio: 0.5, error: 0.001, distance: 10 }, // LOD1: 50% vertices (10-50m)
  { level: 2, ratio: 0.25, error: 0.005, distance: 50 }, // LOD2: 25% vertices (50m+)
];

/**
 * LOD generation options
 */
export interface LODGenerationOptions {
  levels?: Array<Partial<LODLevelConfig>>;
  applyWeld?: boolean; // Weld duplicate vertices
  applyPrune?: boolean; // Remove unused vertices
  outputFormat?: 'separate' | 'nested'; // Separate files or nested in one GLB
}

/**
 * Result of LOD generation
 */
export interface LODGenerationResult {
  assetId: string;
  originalUrl: string;
  lods: LODLevel[];
  totalSizeReduction: number;
}

/**
 * Single LOD generation result
 */
export interface SingleLODResult {
  level: number;
  url: string;
  vertexCount: number;
  fileSize: number;
  distance: number;
  triangleCount: number;
}

/**
 * LOD Generator Service
 *
 * Generates automatic LOD levels using glTF Transform.
 * Creates progressively simplified versions of the 3D model.
 */
export class LODGenerator {
  private io: NodeIO;
  private readonly DEFAULT_CONFIGS = DEFAULT_LOD_CONFIGS;

  constructor() {
    // Initialize glTF Transform IO
    this.io = new NodeIO().setAllowNetwork(false);
  }

  /**
   * Generate all LOD levels for a GLB file
   *
   * @param assetId Asset ID for the generated LODs
   * @param glbUrl URL to the source GLB file
   * @param options Generation options
   * @returns LOD generation result
   */
  async generateLODs(
    assetId: string,
    glbUrl: string,
    options: LODGenerationOptions = {}
  ): Promise<LODGenerationResult> {
    const configs = this.resolveConfigs(options.levels);
    console.log(`[LOD] Generating ${configs.length} LOD levels for asset ${assetId}`);

    try {
      // Fetch the original GLB
      const response = await fetch(glbUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch GLB: ${response.statusText}`);
      }

      const originalBuffer = await response.arrayBuffer();
      const originalSize = originalBuffer.byteLength;

      // Read the document to get original vertex count
      const document = await this.io.readBinary(new Uint8Array(originalBuffer));
      const root = document.getRoot();
      const meshes = root.listMeshes();

      let totalVertexCount = 0;
      for (const mesh of meshes) {
        for (const primitive of mesh.listPrimitives()) {
          const position = primitive.getAttribute('POSITION');
          if (position) {
            totalVertexCount += position.getCount();
          }
        }
      }

      console.log(`[LOD] Original model has ${totalVertexCount} vertices`);

      // Generate each LOD level
      const lods: LODLevel[] = [];
      let totalLodSize = 0;

      for (const config of configs) {
        const lodResult = await this.generateSingleLOD(
          assetId,
          glbUrl,
          config,
          options
        );

        lods.push({
          level: lodResult.level,
          url: lodResult.url,
          vertexCount: lodResult.vertexCount,
          fileSize: lodResult.fileSize,
          distance: lodResult.distance,
        });

        totalLodSize += lodResult.fileSize;

        console.log(
          `[LOD] LOD${lodResult.level} generated: ${lodResult.vertexCount} vertices, ` +
          `${lodResult.fileSize} bytes, switch at ${lodResult.distance}m`
        );
      }

      // Calculate size reduction
      const totalSizeWithLODs = originalSize + totalLodSize;
      const sizeReduction = originalSize > 0
        ? ((originalSize - totalLodSize) / originalSize) * 100
        : 0;

      console.log(`[LOD] Total LOD size: ${totalLodSize} bytes`);
      console.log(`[LOD] Size reduction: ${sizeReduction.toFixed(1)}%`);

      return {
        assetId,
        originalUrl: glbUrl,
        lods,
        totalSizeReduction: sizeReduction,
      };
    } catch (error) {
      console.error(`[LOD] LOD generation failed for asset ${assetId}:`, error);
      throw error;
    }
  }

  /**
   * Generate a single LOD level
   *
   * @param assetId Asset ID
   * @param glbUrl Source GLB URL
   * @param config LOD level configuration
   * @param options Generation options
   * @returns Single LOD result
   */
  async generateSingleLOD(
    assetId: string,
    glbUrl: string,
    config: Partial<LODLevelConfig>,
    options: LODGenerationOptions = {}
  ): Promise<SingleLODResult> {
    const level = config.level ?? 0;
    const ratio = config.ratio ?? 1.0;
    const error = config.error ?? 0.001;
    const distance = config.distance ?? 0;

    console.log(`[LOD] Generating LOD${level} with ratio ${ratio} and error ${error}`);

    try {
      // Fetch and read the original GLB
      const response = await fetch(glbUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch GLB: ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      let document = await this.io.readBinary(new Uint8Array(buffer));

      // Apply optional preprocessing
      const transforms = [];

      if (options.applyWeld !== false) {
        transforms.push(weld({ tolerance: 0.0001 }));
      }
      if (options.applyPrune !== false) {
        transforms.push(prune());
      }
      transforms.push(dedup()); // Always dedup for cleaner files

      if (transforms.length > 0) {
        await document.transform(...transforms);
        console.log(`[LOD] LOD${level}: Applied preprocessing`);
      }

      // Apply simplification if meshoptimizer is available and ratio < 1.0
      if (ratio < 1.0 && MeshoptSimplifier) {
        await document.transform(
          simplify({ simplifier: MeshoptSimplifier, ratio, error })
        );
        console.log(`[LOD] LOD${level}: Simplified with ratio ${ratio}`);
      } else if (ratio < 1.0 && !MeshoptSimplifier) {
        console.warn(`[LOD] LOD${level}: Skipping simplification (meshoptimizer not available)`);
      }

      // Write the LOD
      const lodBuffer = await this.io.writeBinary(document);
      const fileSize = lodBuffer.byteLength;

      // Count vertices and triangles
      const root = document.getRoot();
      let vertexCount = 0;
      let triangleCount = 0;

      for (const mesh of root.listMeshes()) {
        for (const primitive of mesh.listPrimitives()) {
          const position = primitive.getAttribute('POSITION');
          if (position) {
            vertexCount += position.getCount();
          }

          const indices = primitive.getIndices();
          if (indices) {
            triangleCount += indices.getCount() / 3;
          } else if (position) {
            triangleCount += position.getCount() / 3;
          }
        }
      }

      // Generate output URL
      // In production, upload to storage and return the new URL
      const url = glbUrl.replace('.glb', `.lod${level}.glb`);

      return {
        level,
        url,
        vertexCount,
        fileSize,
        distance,
        triangleCount,
      };
    } catch (error) {
      console.error(`[LOD] Failed to generate LOD${level}:`, error);
      throw error;
    }
  }

  /**
   * Get recommended LOD level for a device based on capabilities
   *
   * @param deviceInfo Device capability information
   * @returns Maximum recommended LOD level
   */
  getRecommendedMaxLOD(deviceInfo: {
    isMobile?: boolean;
    gpuTier?: 'low' | 'medium' | 'high';
    memoryGB?: number;
  }): number {
    // High-end desktop can use all LODs
    if (!deviceInfo.isMobile && deviceInfo.gpuTier === 'high') {
      return 2;
    }

    // Medium-end desktop or high-end mobile
    if (!deviceInfo.isMobile && deviceInfo.gpuTier === 'medium') {
      return 1;
    }

    // Low-end devices
    if (deviceInfo.isMobile || deviceInfo.gpuTier === 'low') {
      return 1;
    }

    // Default to LOD1
    return 1;
  }

  /**
   * Get switch distance for an LOD level
   *
   * @param level LOD level
   * @returns Distance in meters
   */
  getSwitchDistance(level: number): number {
    const config = this.DEFAULT_CONFIGS.find(c => c.level === level);
    return config?.distance ?? 0;
  }

  /**
   * Calculate expected file size for an LOD level
   *
   * @param originalSize Original file size
   * @param ratio Vertex retention ratio
   * @returns Estimated file size
   */
  estimateFileSize(originalSize: number, ratio: number): number {
    // Rough estimate: file size scales with vertex count
    // Add some overhead for GLB container
    const containerOverhead = 1024; // 1KB overhead
    const dataSize = originalSize - containerOverhead;
    return Math.floor(containerOverhead + (dataSize * ratio));
  }

  /**
   * Validate LOD file format and structure
   *
   * @param buffer File buffer to validate
   * @param level Expected LOD level
   * @returns True if valid LOD file
   */
  validateLOD(buffer: Buffer, level: number): boolean {
    // Check GLB magic bytes
    const magic = String.fromCharCode(
      buffer[0],
      buffer[1],
      buffer[2],
      buffer[3]
    );

    if (magic !== 'glTF') {
      console.error(`[LOD] Invalid GLB file for LOD${level}`);
      return false;
    }

    // TODO: Additional validation:
    // - Check that vertex count is appropriate for LOD level
    // - Verify mesh structure
    // - Validate materials are preserved

    return true;
  }

  /**
   * Resolve LOD level configurations from options
   */
  private resolveConfigs(
    customLevels?: Array<Partial<LODLevelConfig>>
  ): LODLevelConfig[] {
    if (!customLevels || customLevels.length === 0) {
      return [...this.DEFAULT_CONFIGS];
    }

    return customLevels.map((custom, index) => {
      const defaultConfig = this.DEFAULT_CONFIGS[index] || this.DEFAULT_CONFIGS[0];
      return {
        level: custom.level ?? index,
        ratio: custom.ratio ?? defaultConfig.ratio,
        error: custom.error ?? defaultConfig.error,
        distance: custom.distance ?? defaultConfig.distance,
      };
    });
  }
}

/**
 * Create an LOD generator instance
 */
export function createLODGenerator(): LODGenerator {
  return new LODGenerator();
}
