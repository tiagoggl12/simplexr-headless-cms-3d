/**
 * Thumbnail Generation Service
 * Generates thumbnail renders of 3D assets using:
 * 1. Three.js + Puppeteer (primary)
 * 2. Blender CLI (fallback)
 */

import { join } from 'node:path';
import { mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import puppeteer from 'puppeteer';
import { NodeIO } from '@gltf-transform/core';

const execAsync = promisify(exec);

/**
 * Thumbnail angles/views
 */
export type ThumbnailAngle = 'front' | 'side' | 'top' | 'isometric' | 'back' | 'bottom';

/**
 * Thumbnail render result
 */
export interface ThumbnailResult {
  success: boolean;
  url?: string;
  angle: ThumbnailAngle;
  width: number;
  height: number;
  fileSize: number;
  message: string;
}

/**
 * Thumbnail generation options
 */
export interface ThumbnailOptions {
  angles?: ThumbnailAngle[];
  width?: number;
  height?: number;
  backgroundColor?: string;
  lighting?: {
    intensity?: number;
    color?: string;
    hdri?: string; // URL to HDRI environment map
  };
  camera?: {
    distance?: number;
    fov?: number;
  };
  quality?: number; // JPEG quality 1-100
  format?: 'jpeg' | 'png';
  transparent?: boolean;
  timeout?: number; // Timeout in ms for Puppeteer (default: 120000 for large files)
  useBlender?: boolean; // Force use of Blender CLI
}

/**
 * Preset lighting configurations
 */
export const LIGHTING_PRESETS: Record<string, ThumbnailOptions['lighting']> = {
  studio: {
    intensity: 1.0,
    color: '#ffffff',
  },
  warm: {
    intensity: 0.8,
    color: '#ffeedd',
  },
  cool: {
    intensity: 0.8,
    color: '#ddeeff',
  },
  dramatic: {
    intensity: 1.5,
    color: '#ffffff',
  },
  soft: {
    intensity: 0.5,
    color: '#ffffff',
  },
};

/**
 * Default thumbnail options
 */
const DEFAULT_THUMBNAIL_OPTIONS: Required<Omit<ThumbnailOptions, 'angles'>> = {
  width: 512,
  height: 512,
  backgroundColor: '#f0f0f0',
  lighting: LIGHTING_PRESETS.studio as { intensity?: number; color?: string; hdri?: string },
  camera: {
    distance: 3,
    fov: 45,
  },
  quality: 85,
  format: 'jpeg',
  transparent: false,
  timeout: 120000,
  useBlender: false,
};

/**
 * Camera positions for different angles
 */
const ANGLE_POSITIONS: Record<ThumbnailAngle, { x: number; y: number; z: number }> = {
  front: { x: 0, y: 0.5, z: 3 },
  back: { x: 0, y: 0.5, z: -3 },
  side: { x: 3, y: 0.5, z: 0 },
  top: { x: 0, y: 3, z: 0.01 },
  bottom: { x: 0, y: -3, z: 0.01 },
  isometric: { x: 2, y: 2, z: 2 },
};

/**
 * Thumbnail Generator Configuration
 */
export interface ThumbnailGeneratorConfig {
  tempDir?: string;
  puppeteer?: {
    headless?: boolean;
    executablePath?: string;
    args?: string[];
  };
  blenderPath?: string; // Path to Blender executable
  defaultTimeout?: number; // Default timeout in ms
}

const DEFAULT_CONFIG: ThumbnailGeneratorConfig = {
  tempDir: '/tmp/simplexr-thumbnails',
  puppeteer: {
    headless: true as boolean,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  },
  blenderPath: process.env.BLENDER_PATH || '/Applications/Blender.app/Contents/MacOS/Blender',
  defaultTimeout: 120000, // 2 minutes default for large files
};

/**
 * Thumbnail Generator Service
 */
export class ThumbnailGenerator {
  private config: ThumbnailGeneratorConfig;
  private io: NodeIO;
  private blenderAvailable: boolean = false;

  constructor(config: Partial<ThumbnailGeneratorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.io = new NodeIO().setAllowNetwork(false);
    this.ensureTempDir();
    this.checkBlenderAvailable();
  }

  /**
   * Check if Blender is available (synchronous for constructor)
   */
  private checkBlenderAvailable(): void {
    // Synchronous check using existsSync
    this.blenderAvailable = existsSync(this.config.blenderPath!);
    if (this.blenderAvailable) {
      console.log('[Thumbnail] Blender CLI available at:', this.config.blenderPath);
    } else {
      console.log('[Thumbnail] Blender CLI not available');
    }
  }

  /**
   * Get Blender availability
   */
  async getBlenderInfo(): Promise<{ available: boolean; path?: string; version?: string }> {
    if (this.blenderAvailable) {
      try {
        const { stdout } = await execAsync(`"${this.config.blenderPath}" --version`);
        return {
          available: true,
          path: this.config.blenderPath,
          version: stdout.trim(),
        };
      } catch {
        return { available: true, path: this.config.blenderPath };
      }
    }
    return { available: false };
  }

  /**
   * Ensure temp directory exists (synchronous for constructor)
   */
  private ensureTempDir(): void {
    try {
      mkdirSync(this.config.tempDir!, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  /**
   * Generate thumbnail HTML page with Three.js
   */
  private createThumbnailHTML(
    glbDataUrl: string,
    angle: ThumbnailAngle,
    options: Required<Omit<ThumbnailOptions, 'angles'>>
  ): string {
    const cameraPos = ANGLE_POSITIONS[angle];

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>3D Thumbnail</title>
    <style>
        body { margin: 0; overflow: hidden; background: ${options.backgroundColor}; }
        #canvas { display: block; }
        .loading {
            position: absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            font-family: Arial, sans-serif;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="loading">Loading 3D model...</div>
    <canvas id="canvas"></canvas>

    <script type="importmap">
    {
        "imports": {
            "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
            "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
        }
    }
    </script>

    <script type="module">
        import * as THREE from 'three';
        import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
        import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
        import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
        import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

        const canvas = document.getElementById('canvas');
        const width = ${options.width};
        const height = ${options.height};

        // Scene setup
        const scene = new THREE.Scene();
        scene.background = new THREE.Color('${options.backgroundColor}');

        // Camera
        const camera = new THREE.PerspectiveCamera(
            ${options.camera.fov},
            width / height,
            0.01,
            100
        );
        camera.position.set(${cameraPos.x}, ${cameraPos.y}, ${cameraPos.z});
        camera.lookAt(0, 0, 0);

        // Renderer
        const renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: ${options.transparent},
            preserveDrawingBuffer: true
        });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;

        // Environment
        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        pmremGenerator.compileEquirectangularScene();

        const environment = new RoomEnvironment();
        const envMap = pmremGenerator.fromScene(environment);
        scene.environment = envMap;

        // Lighting
        const ambientLight = new THREE.AmbientLight(
            '${options.lighting.color}',
            ${(options.lighting?.intensity ?? 1) * 0.5}
        );
        scene.add(ambientLight);

        const mainLight = new THREE.DirectionalLight(
            '${options.lighting.color}',
            ${options.lighting?.intensity ?? 1}
        );
        mainLight.position.set(5, 10, 7);
        scene.add(mainLight);

        const fillLight = new THREE.DirectionalLight(
            '${options.lighting.color}',
            ${(options.lighting?.intensity ?? 1) * 0.3}
        );
        fillLight.position.set(-5, 0, -5);
        scene.add(fillLight);

        // Load GLB
        const loader = new GLTFLoader();
        loader.load(
            '${glbDataUrl}',
            function(gltf) {
                // Remove loading message
                document.querySelector('.loading')?.remove();

                const model = gltf.scene;

                // Auto-center and scale
                const box = new THREE.Box3().setFromObject(model);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);

                // Center the model
                model.position.x = -center.x;
                model.position.y = -box.min.y;
                model.position.z = -center.z;

                // Scale to fit
                const scale = 2 / maxDim;
                model.scale.set(scale, scale, scale);

                scene.add(model);

                // Render
                renderer.render(scene, camera);

                // Signal that rendering is complete
                window.__thumbnailReady = true;
                window.__thumbnailData = canvas.toDataURL('image/${options.format}', ${options.quality / 100});
            },
            function(error) {
                console.error('Error loading model:', error);
                document.querySelector('.loading').textContent = 'Error loading model';
            }
        );
    </script>
</body>
</html>
`;
  }

  /**
   * Generate thumbnail using Blender CLI
   */
  private async generateWithBlender(
    glbPath: string,
    outputPath: string,
    angle: ThumbnailAngle,
    options: Required<Omit<ThumbnailOptions, 'angles'>>
  ): Promise<{ success: boolean; filePath: string; fileSize: number; error?: string }> {
    if (!this.blenderAvailable) {
      return {
        success: false,
        filePath: '',
        fileSize: 0,
        error: 'Blender not available',
      };
    }

    try {
      console.log(`[Thumbnail] Using Blender CLI for ${angle} thumbnail`);

      // Camera positions for Blender (different coordinate system: Z-up, Y-forward)
      const blenderCameras: Record<ThumbnailAngle, { location: number[]; rotation: number[] }> = {
        front: { location: [0, -5, 1], rotation: [90, 0, 0] },
        back: { location: [0, 5, 1], rotation: [90, 0, 180] },
        side: { location: [5, 0, 1], rotation: [90, 0, 90] },
        top: { location: [0, 0, 6], rotation: [0, 0, 0] },
        bottom: { location: [0, 0, -6], rotation: [180, 0, 0] },
        isometric: { location: [3.5, -3.5, 3], rotation: [55, 0, 45] },
      };

      const cam = blenderCameras[angle];
      const bgColor = options.backgroundColor.replace('#', '').toLowerCase();
      const lighting = (options.lighting?.intensity ?? 1) * 1000; // 0-1 scale to watts

      // Blender Python script
      const blenderScript = `
import bpy
import sys
import os

try:
    # Find arguments after '--' delimiter
    if '--' in sys.argv:
        argv_index = sys.argv.index('--') + 1
    else:
        argv_index = len(sys.argv)  # Fallback if no delimiter

    glb_path = sys.argv[argv_index] if argv_index < len(sys.argv) else sys.argv[-1]
    output_path = sys.argv[argv_index + 1] if argv_index + 1 < len(sys.argv) else '/tmp/output.jpg'
    width = int(sys.argv[argv_index + 2]) if argv_index + 2 < len(sys.argv) else 512
    height = int(sys.argv[argv_index + 3]) if argv_index + 3 < len(sys.argv) else 512
    bg_color = sys.argv[argv_index + 4] if argv_index + 4 < len(sys.argv) else 'f0f0f0'
    lighting = float(sys.argv[argv_index + 5]) if argv_index + 5 < len(sys.argv) else 1000.0
    cam_location = ${JSON.stringify(cam.location)}
    cam_rotation = ${JSON.stringify(cam.rotation)}

    # Clear existing scene
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()

    # Import GLB
    bpy.ops.import_scene.gltf(filepath=glb_path)

    # Setup camera
    cam_data = bpy.data.cameras.new('ThumbCam')
    cam_obj = bpy.data.objects.new('ThumbCam', cam_data)
    bpy.context.collection.objects.link(cam_obj)
    bpy.context.view_layer.objects.active = cam_obj

    cam_obj.location = cam_location
    cam_obj.rotation_euler = cam_rotation

    # Set camera as active for scene
    bpy.context.scene.camera = cam_obj

    # Detect output format from file extension
    output_lower = output_path.lower()
    if output_lower.endswith('.png'):
        file_format = 'PNG'
        use_alpha = True  # Enable transparency for PNG
    else:
        file_format = 'JPEG'
        use_alpha = False

    # Setup render settings (use EEVEE for faster rendering)
    bpy.context.scene.render.image_settings.file_format = file_format
    bpy.context.scene.render.image_settings.color_mode = 'RGBA' if use_alpha else 'RGB'

    if file_format == 'JPEG':
        bpy.context.scene.render.image_settings.quality = ${options.quality}

    # Remove extension from filepath for Blender (it adds its own)
    import os
    filepath_no_ext = os.path.splitext(output_path)[0]
    bpy.context.scene.render.filepath = filepath_no_ext
    bpy.context.scene.render.resolution_x = width
    bpy.context.scene.render.resolution_y = height
    bpy.context.scene.render.engine = 'BLENDER_EEVEE_NEXT'
    bpy.context.scene.render.dither_intensity = 0.1

    # Enable film transparency for PNG
    bpy.context.scene.render.film_transparent = use_alpha

    # Setup world background (skip for transparent PNG)
    if not use_alpha:
        bpy.context.scene.world = bpy.data.worlds.new('ThumbWorld')
        bpy.context.scene.world.use_nodes = True
        bg_node = bpy.context.scene.world.node_tree.nodes.get('Background')
        if bg_node:
            bg_node.inputs['Color'].default_value = (*(
                int(bg_color[0:2], 16) / 255,
                int(bg_color[2:4], 16) / 255,
                int(bg_color[4:6], 16) / 255,
                1
            ),)

    # Add lighting if no lights exist
    if not bpy.data.lights:
        # Main sun light
        light_data = bpy.data.lights.new('ThumbLight', type='SUN')
        light_obj = bpy.data.objects.new('ThumbLight', light_data)
        bpy.context.collection.objects.link(light_obj)
        light_obj.location = (5, 5, 10)
        light_data.energy = lighting

        # Fill light
        light_data2 = bpy.data.lights.new('FillLight', type='SUN')
        light_obj2 = bpy.data.objects.new('FillLight', light_data2)
        bpy.context.collection.objects.link(light_obj2)
        light_obj2.location = (-3, -1, 5)
        light_obj2.rotation_euler = (45, 0, 45)
        light_data2.energy = lighting * 0.3

    # Set render settings
    bpy.ops.render.render(write_still=True)

    print(f"SUCCESS:{output_path}")

except Exception as e:
    print(f"ERROR:{str(e)}")
    sys.exit(1)
`;

      const scriptPath = join(this.config.tempDir!, `blender_${randomBytes(8).toString('hex')}.py`);

      await writeFile(scriptPath, blenderScript);

      const command = `"${this.config.blenderPath}" --background --python ${scriptPath} -- "${glbPath}" "${outputPath}" ${options.width} ${options.height} ${bgColor} ${lighting}`;

      await execAsync(command, { timeout: 180000 }); // 3 minute timeout

      // Clean up script
      await unlink(scriptPath).catch(() => { });

      // Check if output file exists
      try {
        const stats = await readFile(outputPath);
        return {
          success: true,
          filePath: outputPath,
          fileSize: stats.length,
        };
      } catch {
        return {
          success: false,
          filePath: '',
          fileSize: 0,
          error: 'Output file not created',
        };
      }

    } catch (error: any) {
      return {
        success: false,
        filePath: '',
        fileSize: 0,
        error: error.message,
      };
    }
  }

  /**
   * Generate single thumbnail
   */
  async generateThumbnail(
    assetId: string,
    glbUrl: string,
    angle: ThumbnailAngle = 'isometric',
    options: Partial<ThumbnailOptions> = {}
  ): Promise<ThumbnailResult> {
    console.log(`[Thumbnail] Generating ${angle} thumbnail for asset ${assetId}`);

    const opts = { ...DEFAULT_THUMBNAIL_OPTIONS, ...options };
    const timeout = opts.timeout ?? this.config.defaultTimeout ?? 120000;

    // Prepare output path
    const tempId = randomBytes(16).toString('hex');
    const ext = opts.format === 'png' ? 'png' : 'jpg';
    const filename = `${assetId}_thumb_${angle}_${tempId}.${ext}`;
    const filePath = join(this.config.tempDir!, filename);

    // Get local GLB path for Blender
    const glbLocalPath = glbUrl.startsWith('file://')
      ? glbUrl.replace('file://', '')
      : null;

    // Try Blender first if requested or if we have local file
    if ((opts.useBlender || glbLocalPath) && glbLocalPath && this.blenderAvailable) {
      console.log(`[Thumbnail] Trying Blender CLI for ${angle} thumbnail`);

      const blenderResult = await this.generateWithBlender(
        glbLocalPath,
        filePath,
        angle,
        opts
      );

      if (blenderResult.success) {
        const url = glbUrl.startsWith('file://')
          ? `file://${filePath}`
          : glbUrl.replace('.glb', `_thumb_${angle}.${ext}`);

        console.log(`[Thumbnail] Blender generated ${angle} thumbnail: ${blenderResult.fileSize} bytes`);

        return {
          success: true,
          url,
          angle,
          width: opts.width,
          height: opts.height,
          fileSize: blenderResult.fileSize,
          message: `Thumbnail generated successfully with Blender`,
        };
      }

      console.warn(`[Thumbnail] Blender generation failed: ${blenderResult.error || 'Unknown error'}`);
      if (blenderResult.error) {
        console.error(`[Thumbnail] Blender error details:`, blenderResult.error);
      }
    }

    // Fallback to Puppeteer
    try {
      // Download GLB
      let glbBuffer: Buffer;
      if (glbUrl.startsWith('file://')) {
        const fs = await import('node:fs/promises');
        glbBuffer = await fs.readFile(glbUrl.replace('file://', ''));
      } else {
        const response = await fetch(glbUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch GLB: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        glbBuffer = Buffer.from(arrayBuffer);
      }

      // Validate GLB
      await this.io.readBinary(new Uint8Array(glbBuffer));

      // For large files (>2MB), warn about potential timeout
      const fileSizeMB = glbBuffer.length / (1024 * 1024);
      if (fileSizeMB > 2) {
        console.log(`[Thumbnail] Large file detected (${fileSizeMB.toFixed(2)}MB), may take longer to load`);
      }

      // Convert to base64 data URL
      const glbDataUrl = `data:model/gltf-binary;base64,${glbBuffer.toString('base64')}`;

      // Create HTML
      const html = this.createThumbnailHTML(glbDataUrl, angle, opts);

      // Launch browser
      const browser = await puppeteer.launch({
        headless: this.config.puppeteer?.headless,
        executablePath: this.config.puppeteer?.executablePath,
        args: this.config.puppeteer?.args,
      });

      const page = await browser.newPage();

      // Set viewport
      await page.setViewport({
        width: opts.width,
        height: opts.height,
        deviceScaleFactor: 1,
      });

      // Set HTML content
      await page.setContent(html, { waitUntil: 'networkidle0' });

      // Wait for rendering to complete with configurable timeout
      await page.waitForFunction('window.__thumbnailReady', { timeout });

      // Get image data
      const imageData = await page.evaluate(() => (window as any).__thumbnailData);

      // Close browser
      await browser.close();

      if (!imageData) {
        throw new Error('Failed to capture thumbnail image');
      }

      // Decode base64 and save
      const base64Data = imageData.split(',')[1];
      const imageBuffer = Buffer.from(base64Data, 'base64');

      // Save to file
      await writeFile(filePath, imageBuffer);

      const url = glbUrl.startsWith('file://')
        ? `file://${filePath}`
        : glbUrl.replace('.glb', `_thumb_${angle}.${ext}`);

      console.log(`[Thumbnail] Puppeteer generated ${angle} thumbnail: ${imageBuffer.length} bytes`);

      return {
        success: true,
        url,
        angle,
        width: opts.width,
        height: opts.height,
        fileSize: imageBuffer.length,
        message: `Thumbnail generated successfully with Puppeteer`,
      };

    } catch (error: any) {
      console.error(`[Thumbnail] Generation failed for ${angle}:`, error);
      return {
        success: false,
        angle,
        width: opts.width,
        height: opts.height,
        fileSize: 0,
        message: `Thumbnail generation failed: ${error.message}`,
      };
    }
  }

  /**
   * Generate multiple thumbnails at different angles
   */
  async generateThumbnails(
    assetId: string,
    glbUrl: string,
    options: Partial<ThumbnailOptions> = {}
  ): Promise<ThumbnailResult[]> {
    const opts = { ...DEFAULT_THUMBNAIL_OPTIONS, ...options };
    const angles = opts.angles || ['front', 'isometric', 'side'];

    console.log(`[Thumbnail] Generating ${angles.length} thumbnails for asset ${assetId}`);

    const results: ThumbnailResult[] = [];

    // Generate thumbnails in parallel
    const promises = angles.map(angle =>
      this.generateThumbnail(assetId, glbUrl, angle, options)
    );

    const settled = await Promise.allSettled(promises);

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[Thumbnail] Generated ${successCount}/${angles.length} thumbnails successfully`);

    return results;
  }

  /**
   * Generate 360° thumbnail set (multiple angles)
   */
  async generate360Thumbnails(
    assetId: string,
    glbUrl: string,
    options: Partial<Omit<ThumbnailOptions, 'angles'>> = {}
  ): Promise<{
    success: boolean;
    thumbnails: ThumbnailResult[];
    message: string;
  }> {
    const allAngles: ThumbnailAngle[] = ['front', 'side', 'top', 'isometric', 'back'];

    const results = await this.generateThumbnails(assetId, glbUrl, {
      ...options,
      angles: allAngles,
    });

    const successCount = results.filter(r => r.success).length;

    return {
      success: successCount > 0,
      thumbnails: results,
      message: `Generated ${successCount}/${allAngles.length} 360° thumbnails`,
    };
  }

  /**
   * Generate sprite sheet for rotation preview
   */
  async generateSpriteSheet(
    assetId: string,
    glbUrl: string,
    options: {
      frames?: number; // Number of rotation frames
      columns?: number; // Columns in sprite sheet
      width?: number; // Frame width
      height?: number; // Frame height
    } = {}
  ): Promise<{
    success: boolean;
    url?: string;
    frames: number;
    message: string;
  }> {
    const frames = options.frames || 16;
    const frameWidth = options.width || 128;
    const frameHeight = options.height || 128;

    console.log(`[Thumbnail] Generating ${frames}-frame sprite sheet for asset ${assetId}`);

    // This would require a more complex implementation
    // For now, return a stub result
    return {
      success: false,
      frames,
      message: 'Sprite sheet generation not yet implemented',
    };
  }

  /**
   * Clean up temporary thumbnail files
   */
  async cleanup(maxAge: number = 24 * 60 * 60 * 1000): Promise<number> {
    const fs = await import('node:fs/promises');
    const now = Date.now();
    let cleaned = 0;

    try {
      const files = await fs.readdir(this.config.tempDir!);

      for (const file of files) {
        const filePath = join(this.config.tempDir!, file);
        const stats = await fs.stat(filePath);

        if (now - stats.mtimeMs > maxAge) {
          await unlink(filePath);
          cleaned++;
        }
      }
    } catch (error) {
      // Directory might not exist
    }

    console.log(`[Thumbnail] Cleaned up ${cleaned} old thumbnail files`);
    return cleaned;
  }

  /**
   * Get thumbnail generation statistics
   */
  async getStats(): Promise<{
    totalGenerated: number;
    byAngle: Record<ThumbnailAngle, number>;
    averageSize: number;
  }> {
    // TODO: Implement stats tracking in database
    return {
      totalGenerated: 0,
      byAngle: {
        front: 0,
        side: 0,
        top: 0,
        isometric: 0,
        back: 0,
        bottom: 0,
      },
      averageSize: 0,
    };
  }
}

/**
 * Create thumbnail generator instance
 */
export function createThumbnailGenerator(config?: Partial<ThumbnailGeneratorConfig>): ThumbnailGenerator {
  return new ThumbnailGenerator(config);
}

/**
 * Singleton instance
 */
let thumbnailGeneratorInstance: ThumbnailGenerator | null = null;

export function getThumbnailGenerator(): ThumbnailGenerator {
  if (!thumbnailGeneratorInstance) {
    thumbnailGeneratorInstance = new ThumbnailGenerator();
  }
  return thumbnailGeneratorInstance;
}
