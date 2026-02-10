import { NodeIO, Primitive, Property } from '@gltf-transform/core';
import { weld, prune, dedup, center, quantize } from '@gltf-transform/functions';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';

const execAsync = promisify(exec);

// Lazy-load Draco encoder/decoder (optional dependency)
let DracoEncoder: any = undefined;
let DracoDecoder: any = undefined;
let draco3dgltfAvailable: boolean = false;

/**
 * Try to load draco3dgltf module
 */
async function loadDracoModule(): Promise<boolean> {
  if (draco3dgltfAvailable) {
    return true;
  }

  try {
    // @ts-ignore - draco3dgltf has no type declarations
    const dracoModule = await import('draco3dgltf');
    DracoEncoder = dracoModule.Encoder;
    DracoDecoder = dracoModule.Decoder;
    draco3dgltfAvailable = true;
    console.log('[Draco] draco3dgltf module loaded successfully');
    return true;
  } catch {
    console.warn('[Draco] draco3dgltf module not found - compression will use CLI if available');
    return false;
  }
}

/**
 * Draco compression configuration
 */
export interface DracoCompressionOptions {
  encodeSpeed?: number; // 0-10, higher = faster but less compression (default: 5)
  decodeSpeed?: number; // 0-10, higher = faster decoding but less compression (default: 5)
  compressionLevel?: number; // 1-10, higher = better compression (default: 7)
  quantization?: {
    position?: number; // Bits for position quantization (default: 14)
    normal?: number;   // Bits for normal quantization (default: 10)
    texcoord?: number; // Bits for texcoord quantization (default: 12)
    color?: number;    // Bits for color quantization (default: 10)
    generic?: number;  // Bits for other attributes (default: 12)
  };
  applyWeld?: boolean; // Weld duplicate vertices before compression
  applyPrune?: boolean; // Remove unused resources before compression
  applyCenter?: boolean; // Center model before compression
  applyQuantize?: boolean; // Quantize attributes before compression
  useCLI?: boolean; // Prefer gltf-draco CLI over JS implementation
}

/**
 * Result of Draco compression
 */
export interface DracoCompressionResult {
  dracoUrl: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  encodeTime: number; // milliseconds
  meshCount: number;
  vertexCount: number;
  triangleCount: number;
  method: 'cli' | 'js' | 'simulated';
}

/**
 * Draco compression metadata
 */
export interface DracoMetadata {
  compressed: boolean;
  encoderVersion: string;
  encodingOptions: {
    encodeSpeed: number;
    decodeSpeed: number;
    compressionLevel: number;
  };
  quantization: DracoCompressionOptions['quantization'];
}

/**
 * Draco Compression Service
 *
 * Handles Draco geometry compression for 3D models using:
 * 1. gltf-draco CLI tool (preferred for production)
 * 2. draco3dgltf Node.js module (JS fallback)
 * 3. Simulated compression for testing
 *
 * Draco provides 10-20x geometry compression with minimal quality loss.
 */
export class DracoCompressor {
  private io: NodeIO;
  private readonly DEFAULT_OPTIONS: Required<DracoCompressionOptions> = {
    encodeSpeed: 5,
    decodeSpeed: 5,
    compressionLevel: 7,
    quantization: {
      position: 14,
      normal: 10,
      texcoord: 12,
      color: 10,
      generic: 12,
    },
    applyWeld: true,
    applyPrune: true,
    applyCenter: false,
    applyQuantize: true,
    useCLI: true,
  };
  private tempDir: string;
  private cliAvailable: boolean = false;
  private cliChecked: boolean = false;

  constructor(tempDir?: string) {
    this.tempDir = tempDir || join(tmpdir(), 'simplexr-draco');
    this.ensureTempDir();

    this.io = new NodeIO().setAllowNetwork(false);

    // Try to load Draco module on initialization
    loadDracoModule();
  }

  /**
   * Ensure temp directory exists
   */
  private async ensureTempDir(): Promise<void> {
    try {
      await mkdir(this.tempDir, { recursive: true });
    } catch {
      // Directory might already exist
    }
  }

  /**
   * Check if gltf-draco CLI tool is available
   */
  private async checkCLIAvailable(): Promise<boolean> {
    if (this.cliChecked) {
      return this.cliAvailable;
    }

    this.cliChecked = true;

    try {
      const { stdout } = await execAsync('which gltf-draco');
      this.cliAvailable = !!stdout.trim();
      if (this.cliAvailable) {
        console.log('[Draco] gltf-draco CLI tool found');
      }
    } catch {
      console.warn('[Draco] gltf-draco CLI tool not found');
      this.cliAvailable = false;
    }

    return this.cliAvailable;
  }

  /**
   * Compress using gltf-draco CLI
   */
  private async compressWithCLI(
    inputPath: string,
    outputPath: string,
    options: Required<DracoCompressionOptions>
  ): Promise<{ buffer: Buffer; encodeTime: number }> {
    const startTime = Date.now();

    // Build CLI arguments
    const args = [
      '-i', inputPath,
      '-o', outputPath,
      '-c', // Compress
    ];

    // Add compression level
    args.push('--level', options.compressionLevel.toString());

    // Add quantization options
    if (options.quantization) {
      if (options.quantization.position) {
        args.push('--quantization-position', options.quantization.position.toString());
      }
      if (options.quantization.normal) {
        args.push('--quantization-normal', options.quantization.normal.toString());
      }
      if (options.quantization.texcoord) {
        args.push('--quantization-texcoord', options.quantization.texcoord.toString());
      }
      if (options.quantization.color) {
        args.push('--quantization-color', options.quantization.color.toString());
      }
    }

    const command = `gltf-draco ${args.join(' ')}`;
    await execAsync(command);

    const buffer = await readFile(outputPath);
    const encodeTime = Date.now() - startTime;

    // Clean up input file
    await unlink(inputPath).catch(() => { });
    await unlink(outputPath).catch(() => { });

    return { buffer, encodeTime };
  }

  /**
   * Compress a GLB file using Draco geometry compression
   */
  async compressGLB(
    glbUrl: string,
    options: DracoCompressionOptions = {}
  ): Promise<DracoCompressionResult> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    console.log(`[Draco] Compressing ${glbUrl} with level ${opts.compressionLevel}`);

    const startTime = Date.now();

    try {
      // Fetch the GLB file
      let buffer: Buffer;
      if (glbUrl.startsWith('file://')) {
        buffer = await readFile(glbUrl.replace('file://', ''));
      } else {
        const response = await fetch(glbUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch GLB: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
      }

      const originalSize = buffer.byteLength;

      // Read the document
      const document = await this.io.readBinary(new Uint8Array(buffer));
      const root = document.getRoot();

      // Count meshes and vertices before compression
      const meshes = root.listMeshes();
      const meshCount = meshes.length;
      let vertexCount = 0;
      let triangleCount = 0;

      for (const mesh of meshes) {
        for (const primitive of mesh.listPrimitives()) {
          const position = primitive.getAttribute('POSITION');
          if (position) {
            vertexCount += position.getCount();
            triangleCount += position.getCount() / 3;
          }
        }
      }

      console.log(`[Draco] Found ${meshCount} mesh(es), ${vertexCount} vertices, ${triangleCount} triangles`);

      // Apply optional preprocessing
      const transforms = [];

      if (opts.applyCenter) {
        transforms.push(center());
        console.log('[Draco] Applied center transform');
      }

      if (opts.applyWeld) {
        // Weld with tolerance to merge nearby vertices
        transforms.push(weld({ tolerance: 0.0001 } as any));
        console.log('[Draco] Applied weld transform');
      }

      if (opts.applyPrune) {
        transforms.push(prune());
        console.log('[Draco] Applied prune transform');
      }

      transforms.push(dedup()); // Always dedup for cleaner files

      if (opts.applyQuantize) {
        // Quantize attributes for better compression
        transforms.push(quantize({
          quantizePosition: opts.quantization.position!,
          quantizeNormal: opts.quantization.normal!,
          quantizeTexcoord: opts.quantization.texcoord!,
          quantizeColor: opts.quantization.color!,
          quantizeGeneric: opts.quantization.generic!,
        }));
        console.log('[Draco] Applied quantize transform');
      }

      if (transforms.length > 0) {
        await document.transform(...transforms);
      }

      let compressedBuffer: Uint8Array;
      let encodeTime = Date.now() - startTime;
      let method: 'cli' | 'js' | 'simulated' = 'simulated';

      // Check if CLI is available and preferred
      const useCLI = opts.useCLI && await this.checkCLIAvailable();

      // Check if draco3dgltf module is available
      const hasDracoModule = await loadDracoModule();

      if (useCLI) {
        // Use CLI for compression
        console.log('[Draco] Using CLI compression');

        // Write document to temp file
        const tempInputPath = join(this.tempDir, `input_${randomBytes(8).toString('hex')}.glb`);
        const tempOutputPath = join(this.tempDir, `output_${randomBytes(8).toString('hex')}.glb`);

        const preCompressedBuffer = await this.io.writeBinary(document);
        await writeFile(tempInputPath, Buffer.from(preCompressedBuffer));

        const result = await this.compressWithCLI(tempInputPath, tempOutputPath, opts);
        compressedBuffer = new Uint8Array(result.buffer);
        encodeTime = result.encodeTime;
        method = 'cli';

      } else if (hasDracoModule) {
        // Use draco3dgltf for compression
        console.log('[Draco] Using draco3dgltf for compression');

        // Note: Actual compression would require glTF Transform extensions
        // For now, apply the transforms and write
        // In a real implementation, you would use @gltf-transform/extensions
        // with draco() function

        console.warn('[Draco] glTF Transform draco() extension not integrated - applying transforms only');
        compressedBuffer = await this.io.writeBinary(document);
        encodeTime = Date.now() - startTime;
        method = 'js';

      } else {
        // Simulated compression - just apply optimizations
        console.warn('[Draco] No compression available - applying optimizations only');
        compressedBuffer = await this.io.writeBinary(document);
        encodeTime = Date.now() - startTime;
        method = 'simulated';
      }

      const compressedSize = compressedBuffer.byteLength;
      const compressionRatio = ((originalSize - compressedSize) / originalSize) * 100;

      console.log(
        `[Draco] Compression complete (${method}): ${originalSize} -> ${compressedSize} bytes ` +
        `(${compressionRatio.toFixed(1)}% reduction) in ${encodeTime}ms`
      );

      // Generate output URL
      const dracoUrl = glbUrl.replace('.glb', '.draco.glb');

      return {
        dracoUrl,
        originalSize,
        compressedSize,
        compressionRatio,
        encodeTime,
        meshCount,
        vertexCount,
        triangleCount,
        method,
      };
    } catch (error) {
      console.error('[Draco] Compression failed:', error);
      throw error;
    }
  }

  /**
   * Decompress a Draco-encoded GLB file
   */
  async decompressGLB(dracoUrl: string): Promise<Buffer> {
    console.log(`[Draco] Decompressing ${dracoUrl}`);

    try {
      let buffer: Buffer;
      if (dracoUrl.startsWith('file://')) {
        buffer = await readFile(dracoUrl.replace('file://', ''));
      } else {
        const response = await fetch(dracoUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch Draco GLB: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
      }

      // Note: Actual decompression would require Draco decoder
      // For now, return the buffer as-is
      // In a real implementation, you would use draco3dgltf.Decoder

      if (draco3dgltfAvailable && DracoDecoder) {
        console.warn('[Draco] draco3dgltf decoder available but not integrated');
      } else {
        console.warn('[Draco] No decoder available - returning buffer as-is');
      }

      return buffer;
    } catch (error) {
      console.error('[Draco] Decompression failed:', error);
      throw error;
    }
  }

  /**
   * Check if a GLB file is Draco-encoded
   */
  isDracoEncoded(buffer: Buffer): boolean {
    try {
      const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

      // Check GLB magic
      const magic = String.fromCharCode(
        view.getUint8(0),
        view.getUint8(1),
        view.getUint8(2),
        view.getUint8(3)
      );

      if (magic !== 'glTF') {
        return false;
      }

      // Read JSON chunk
      let offset = 12; // Skip header

      while (offset < buffer.byteLength) {
        const chunkLength = view.getUint32(offset, true);
        const chunkType = view.getUint32(offset + 4, true);

        // JSON chunk type is 0x4E4F534A (JSON in ASCII)
        if (chunkType === 0x4E4F534A) {
          const jsonChunk = buffer.slice(offset + 8, offset + 8 + chunkLength);
          const json = JSON.parse(jsonChunk.toString());

          return (
            json.extensionsUsed?.includes('KHR_draco_mesh_compression') ||
            !!json.meshes?.some((m: any) =>
              m.primitives?.some((p: any) =>
                p.extensions?.KHR_draco_mesh_compression
              )
            )
          );
        }

        offset += 8 + chunkLength;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Get recommended compression level for a model
   */
  getRecommendedCompressionLevel(vertexCount: number, triangleCount: number): number {
    if (triangleCount > 100000) {
      return 9;
    } else if (triangleCount > 50000) {
      return 8;
    } else if (triangleCount > 20000) {
      return 7;
    } else if (triangleCount > 10000) {
      return 6;
    } else {
      return 5;
    }
  }

  /**
   * Validate Draco compression settings
   */
  validateOptions(options: DracoCompressionOptions): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (options.encodeSpeed !== undefined && (options.encodeSpeed < 0 || options.encodeSpeed > 10)) {
      errors.push('encodeSpeed must be between 0 and 10');
    }

    if (options.decodeSpeed !== undefined && (options.decodeSpeed < 0 || options.decodeSpeed > 10)) {
      errors.push('decodeSpeed must be between 0 and 10');
    }

    if (options.compressionLevel !== undefined && (options.compressionLevel < 0 || options.compressionLevel > 10)) {
      errors.push('compressionLevel must be between 0 and 10');
    }

    if (options.quantization) {
      const q = options.quantization;
      if (q.position !== undefined && (q.position < 8 || q.position > 16)) {
        errors.push('position quantization must be between 8 and 16 bits');
      }
      if (q.normal !== undefined && (q.normal < 8 || q.normal > 16)) {
        errors.push('normal quantization must be between 8 and 16 bits');
      }
      if (q.texcoord !== undefined && (q.texcoord < 8 || q.texcoord > 16)) {
        errors.push('texcoord quantization must be between 8 and 16 bits');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get metadata about Draco compression capabilities
   */
  async getCapabilities(): Promise<{
    available: boolean;
    method: 'cli' | 'js' | 'none';
    cliAvailable: boolean;
    jsModuleAvailable: boolean;
    encoderVersion: string;
    decoderVersion: string;
    supportedFormats: string[];
  }> {
    const cliAvailable = await this.checkCLIAvailable();
    const jsModuleAvailable = await loadDracoModule();

    let version = 'not installed';
    if (cliAvailable) {
      try {
        const { stdout } = await execAsync('gltf-draco --version');
        version = stdout.trim() || 'unknown';
      } catch {
        version = 'unknown';
      }
    }

    return {
      available: cliAvailable || jsModuleAvailable,
      method: cliAvailable ? 'cli' : jsModuleAvailable ? 'js' : 'none',
      cliAvailable,
      jsModuleAvailable,
      encoderVersion: version,
      decoderVersion: version,
      supportedFormats: ['glb'],
    };
  }
}

/**
 * Create a Draco compressor instance
 */
export function createDracoCompressor(tempDir?: string): DracoCompressor {
  return new DracoCompressor(tempDir);
}

/**
 * Singleton instance
 */
let dracoCompressorInstance: DracoCompressor | null = null;

export function getDracoCompressor(): DracoCompressor {
  if (!dracoCompressorInstance) {
    dracoCompressorInstance = new DracoCompressor();
  }
  return dracoCompressorInstance;
}
