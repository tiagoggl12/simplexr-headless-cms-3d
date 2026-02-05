import { MemoryStore } from '../store.js';
import { AssetStatus } from '../models.js';
import { RedisQueueService } from './redis-queue.js';
import { NodeIO } from '@gltf-transform/core';

/**
 * Result of a GLB validation
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  size: number;
  version: string;
}

/**
 * Result of GLB optimization
 */
export interface OptimizationResult {
  originalSize: number;
  optimizedSize: number;
  compressionRatio: number;
  outputUrl: string;
}

/**
 * Result of USDZ generation (stub for now)
 */
export interface UsdzResult {
  success: boolean;
  outputUrl?: string;
  message: string;
}

/**
 * Result of thumbnail generation (stub for now)
 */
export interface ThumbnailResult {
  success: boolean;
  outputUrl?: string;
  message: string;
}

/**
 * Processing pipeline configuration
 */
export interface ProcessingConfig {
  maxFileSize: number; // in bytes (default: 100MB)
  enableCompression: boolean;
  textureQuality: number; // 0-100, lower = more compression
  enableDracoCompression: boolean;
}

const DEFAULT_CONFIG: ProcessingConfig = {
  maxFileSize: 100 * 1024 * 1024, // 100MB
  enableCompression: true,
  textureQuality: 75,
  enableDracoCompression: false, // Requires Draco setup
};

/**
 * Service for processing 3D assets in the pipeline
 * Handles validation, optimization, USDZ conversion, and thumbnail generation
 */
export class ProcessingService {
  private io: NodeIO;
  private config: ProcessingConfig;

  constructor(
    private store: MemoryStore,
    private queue: RedisQueueService,
    config: Partial<ProcessingConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize glTF Transform IO
    this.io = new NodeIO()
      .setAllowNetwork(false); // Security: don't fetch external resources
  }

  /**
   * Start the processing pipeline for an asset
   * Enqueues jobs for validation, optimization, USDZ generation, and thumbnail
   */
  async processAsset(assetId: string, glbUrl: string): Promise<void> {
    const asset = this.store.getAsset(assetId);
    if (!asset) {
      throw new Error(`Asset not found: ${assetId}`);
    }

    // Update asset status to processing
    this.store.updateAsset(assetId, { status: 'processing' });
    console.log(`[Processing] Starting pipeline for asset ${assetId}`);

    // Enqueue the complete pipeline jobs
    // Jobs will be processed in order by the workers
    await this.queue.processGlb(assetId, glbUrl);
  }

  /**
   * Validate a GLB file
   * Checks file size, format validity, and glTF version
   */
  async validateGlb(glbUrl: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    console.log(`[Processing] Validating GLB: ${glbUrl}`);

    try {
      // Fetch the GLB file
      const response = await fetch(glbUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch GLB: ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      const size = buffer.byteLength;

      // Check file size
      if (size > this.config.maxFileSize) {
        errors.push(
          `File too large: ${(size / 1024 / 1024).toFixed(2)}MB exceeds limit of ${
            this.config.maxFileSize / 1024 / 1024
          }MB`
        );
      }

      // Check GLB magic bytes (glTF binary: 0x676C5446)
      const header = new Uint8Array(buffer.slice(0, 4));
      const magic = String.fromCharCode(header[0], header[1], header[2], header[3]);
      if (magic !== 'glTF') {
        errors.push(`Invalid GLB file: magic bytes '${magic}' != 'glTF'`);
      }

      // Try to parse with glTF Transform
      if (errors.length === 0) {
        try {
          const document = await this.io.readBinary(new Uint8Array(buffer));
          const root = document.getRoot();
          const asset = root.getAsset();

          // Get version if available
          const version = asset && typeof asset.getVersion === 'function' ? asset.getVersion() : '2.0';

          // Check for issues
          const scene = root.getDefaultScene();
          if (!scene) {
            warnings.push('No default scene defined');
          }

          const meshCount = root.listMeshes().length;
          const textureCount = root.listTextures().length;

          warnings.push(`Contains ${meshCount} mesh(es) and ${textureCount} texture(s)`);

          return {
            valid: true,
            errors,
            warnings,
            size,
            version,
          };
        } catch (parseError) {
          errors.push(`Failed to parse GLB: ${String(parseError)}`);
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        size,
        version: 'unknown',
      };
    } catch (error) {
      errors.push(`Validation error: ${error}`);
      return {
        valid: false,
        errors,
        warnings,
        size: 0,
        version: 'unknown',
      };
    }
  }

  /**
   * Optimize a GLB file
   * Applies compression, removes unused data, and optimizes textures
   */
  async optimizeGlb(assetId: string, glbUrl: string): Promise<OptimizationResult> {
    console.log(`[Processing] Optimizing GLB for asset ${assetId}`);

    try {
      // Fetch the original GLB
      const response = await fetch(glbUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch GLB: ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      const originalSize = buffer.byteLength;

      // Read and process with glTF Transform
      const document = await this.io.readBinary(new Uint8Array(buffer));
      const root = document.getRoot();

      // Basic cleanup - remove unused nodes/materials
      // In a full implementation, you would add transforms here:
      // - prune()
      // - dedup()
      // - dracoCompress()
      // - textureCompress()

      // For now, just write back (no actual optimization in V0)
      const optimizedBuffer = await this.io.writeBinary(document);

      const optimizedSize = optimizedBuffer.byteLength;
      const compressionRatio = ((originalSize - optimizedSize) / originalSize) * 100;

      // In production, upload to storage and return new URL
      // For V0, return original URL
      const outputUrl = glbUrl;

      console.log(
        `[Processing] Optimization complete: ${originalSize} -> ${optimizedSize} bytes (${compressionRatio.toFixed(1)}% reduction)`
      );

      return {
        originalSize,
        optimizedSize,
        compressionRatio,
        outputUrl,
      };
    } catch (error) {
      console.error(`[Processing] Optimization failed for asset ${assetId}:`, error);
      throw error;
    }
  }

  /**
   * Generate USDZ file from GLB for iOS AR Quick Look
   * STUB: Currently just logs the operation
   * TODO: Implement actual conversion using usdzo or similar tool
   */
  async generateUsdz(assetId: string, glbUrl: string): Promise<UsdzResult> {
    console.log(`[Processing] Generating USDZ for asset ${assetId} from ${glbUrl}`);

    // STUB: In production, this would:
    // 1. Download the GLB
    // 2. Use a tool like usdzo or Blender to convert to USDZ
    // 3. Upload to storage
    // 4. Return the new URL

    // For now, just log and return success
    console.log(`[Processing] USDZ generation stubbed for asset ${assetId}`);
    console.log(`[Processing] Would convert ${glbUrl} to USDZ format`);

    return {
      success: true,
      message: 'USDZ generation stubbed - would convert to iOS-compatible format',
    };
  }

  /**
   * Generate thumbnail renders for a 3D asset
   * STUB: Currently just logs the operation
   * TODO: Implement actual rendering using Blender or headless GL renderer
   */
  async generateThumbnail(
    assetId: string,
    glbUrl: string,
    lightingPresetId?: string
  ): Promise<ThumbnailResult> {
    console.log(`[Processing] Generating thumbnail for asset ${assetId}`);

    if (lightingPresetId) {
      console.log(`[Processing] Using lighting preset: ${lightingPresetId}`);
    }

    // STUB: In production, this would:
    // 1. Download the GLB
    // 2. Load it into a headless renderer (Blender, Three.js headless, etc.)
    // 3. Apply the lighting preset
    // 4. Render from multiple angles
    // 5. Upload thumbnails to storage
    // 6. Return thumbnail URLs

    console.log(`[Processing] Thumbnail generation stubbed for asset ${assetId}`);
    console.log(`[Processing] Would render ${glbUrl} with configured lighting`);

    return {
      success: true,
      message: 'Thumbnail generation stubbed - would render preview images',
    };
  }

  /**
   * Run the complete processing pipeline synchronously
   * This is useful for testing or small assets
   */
  async runPipeline(assetId: string, glbUrl: string): Promise<void> {
    console.log(`[Processing] Running complete pipeline for asset ${assetId}`);

    // Update status to processing
    this.store.updateAsset(assetId, { status: 'processing' });

    try {
      // Step 1: Validate
      const validation = await this.validateGlb(glbUrl);
      if (!validation.valid) {
        throw new Error(`GLB validation failed: ${validation.errors.join(', ')}`);
      }
      console.log(`[Processing] Validation passed for asset ${assetId}`);

      // Step 2: Optimize
      const optimization = await this.optimizeGlb(assetId, glbUrl);
      console.log(
        `[Processing] Optimization complete: ${optimization.compressionRatio.toFixed(1)}% reduction`
      );

      // Step 3: Generate USDZ
      const usdzResult = await this.generateUsdz(assetId, optimization.outputUrl);
      if (!usdzResult.success) {
        console.warn(`[Processing] USDZ generation failed: ${usdzResult.message}`);
      }

      // Step 4: Generate thumbnails (using default lighting)
      const thumbnailResult = await this.generateThumbnail(assetId, optimization.outputUrl);
      if (!thumbnailResult.success) {
        console.warn(`[Processing] Thumbnail generation failed: ${thumbnailResult.message}`);
      }

      // Update status to ready
      this.store.updateAsset(assetId, { status: 'ready' });
      console.log(`[Processing] Pipeline complete for asset ${assetId}`);
    } catch (error) {
      console.error(`[Processing] Pipeline failed for asset ${assetId}:`, error);
      this.store.updateAsset(assetId, { status: 'failed' });
      throw error;
    }
  }

  /**
   * Get the processing configuration
   */
  getConfig(): ProcessingConfig {
    return { ...this.config };
  }

  /**
   * Update the processing configuration
   */
  updateConfig(updates: Partial<ProcessingConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

/**
 * Create a processing service instance
 */
export function createProcessingService(
  store: MemoryStore,
  queue: RedisQueueService,
  config?: Partial<ProcessingConfig>
): ProcessingService {
  return new ProcessingService(store, queue, config);
}
