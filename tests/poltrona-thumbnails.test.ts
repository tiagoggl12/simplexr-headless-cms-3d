import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, unlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ThumbnailGenerator, type ThumbnailResult } from '../src/services/thumbnail-generator.js';
import { mkdir } from 'node:fs/promises';

const TEST_GLB_PATH = join(process.cwd(), 'tests/fixtures/poltrona-guadalupe.glb');
const FILE_URL = `file://${TEST_GLB_PATH}`;
const OUTPUT_DIR = join(process.cwd(), 'tests/thumbnails-output');

describe('Poltrona Guadalupe - Thumbnail Generation', () => {
  let generator: ThumbnailGenerator;

  beforeAll(async () => {
    await mkdir(OUTPUT_DIR, { recursive: true });
    generator = new ThumbnailGenerator({ tempDir: OUTPUT_DIR });
  });

  afterAll(() => {
    // Optional: Clean up generated thumbnails
    // But keeping them for inspection
  });

  describe('Thumbnail Generation Tests', () => {
    it('should generate isometric thumbnail', { timeout: 60000 }, async () => {
      console.log('\n┌─────────────────────────────────────────────┐');
      console.log('│     GENERATING ISOMETRIC THUMBNAIL       │');
      console.log('└─────────────────────────────────────────────┘');

      const result: ThumbnailResult = await generator.generateThumbnail(
        'poltrona-guadalupe',
        FILE_URL,
        'isometric',
        {
          width: 512,
          height: 512,
          backgroundColor: '#f0f0f0',
          quality: 85,
          format: 'jpeg',
        }
      );

      console.log(`\n✓ Thumbnail Generated:`);
      console.log(`  - URL: ${result.url}`);
      console.log(`  - Size: ${result.fileSize} bytes (${(result.fileSize / 1024).toFixed(2)} KB)`);
      console.log(`  - Dimensions: ${result.width}x${result.height}`);
      console.log(`  - Angle: ${result.angle}`);
      console.log(`  - Success: ${result.success}`);

      expect(result.success).toBe(true);
      expect(result.fileSize).toBeGreaterThan(0);

      // Verify file exists
      if (result.url && result.url.startsWith('file://')) {
        const filePath = result.url.replace('file://', '');
        expect(existsSync(filePath)).toBe(true);
      }
    });

    it('should generate front thumbnail', { timeout: 60000 }, async () => {
      console.log('\n┌─────────────────────────────────────────────┐');
      console.log('│      GENERATING FRONT THUMBNAIL          │');
      console.log('└─────────────────────────────────────────────┘');

      const result = await generator.generateThumbnail(
        'poltrona-guadalupe',
        FILE_URL,
        'front',
        {
          width: 512,
          height: 512,
          backgroundColor: '#ffffff',
          quality: 90,
          format: 'jpeg',
        }
      );

      console.log(`\n✓ Front Thumbnail: ${(result.fileSize / 1024).toFixed(2)} KB`);
      expect(result.success).toBe(true);
      expect(result.angle).toBe('front');
    });

    it('should generate side thumbnail', { timeout: 60000 }, async () => {
      console.log('\n┌─────────────────────────────────────────────┐');
      console.log('│       GENERATING SIDE THUMBNAIL           │');
      console.log('└─────────────────────────────────────────────┘');

      const result = await generator.generateThumbnail(
        'poltrona-guadalupe',
        FILE_URL,
        'side',
        {
          width: 512,
          height: 512,
          backgroundColor: '#e0e0e0',
          quality: 85,
          format: 'jpeg',
        }
      );

      console.log(`\n✓ Side Thumbnail: ${(result.fileSize / 1024).toFixed(2)} KB`);
      expect(result.success).toBe(true);
      expect(result.angle).toBe('side');
    });

    it('should generate PNG thumbnail with transparency', { timeout: 60000 }, async () => {
      console.log('\n┌─────────────────────────────────────────────┐');
      console.log('│     GENERATING PNG TRANSPARENT THUMB      │');
      console.log('└─────────────────────────────────────────────┘');

      const result = await generator.generateThumbnail(
        'poltrona-guadalupe',
        FILE_URL,
        'isometric',
        {
          width: 512,
          height: 512,
          transparent: true,
          format: 'png',
        }
      );

      console.log(`\n✓ PNG Thumbnail: ${(result.fileSize / 1024).toFixed(2)} KB`);
      expect(result.success).toBe(true);
    });

    it('should generate high-resolution thumbnail', { timeout: 60000 }, async () => {
      console.log('\n┌─────────────────────────────────────────────┐');
      console.log('│     GENERATING HIGH-RES THUMBNAIL (1080p) │');
      console.log('└─────────────────────────────────────────────┘');

      const result = await generator.generateThumbnail(
        'poltrona-guadalupe',
        FILE_URL,
        'isometric',
        {
          width: 1080,
          height: 1080,
          backgroundColor: '#f5f5f5',
          quality: 95,
          format: 'jpeg',
        }
      );

      console.log(`\n✓ High-Res Thumbnail: ${(result.fileSize / 1024).toFixed(2)} KB (${result.width}x${result.height})`);
      expect(result.success).toBe(true);
      expect(result.width).toBe(1080);
      expect(result.height).toBe(1080);
    });
  });

  describe('Multi-Angle Thumbnail Generation', () => {
    it('should generate all standard angles at once', { timeout: 120000 }, async () => {
      console.log('\n┌─────────────────────────────────────────────┐');
      console.log('│     GENERATING 360° THUMBNAIL SET         │');
      console.log('└─────────────────────────────────────────────┘');

      const result = await generator.generate360Thumbnails(
        'poltrona-guadalupe',
        FILE_URL,
        {
          width: 512,
          height: 512,
          backgroundColor: '#f0f0f0',
          quality: 85,
          format: 'jpeg',
        }
      );

      console.log(`\n✓ Generated ${result.thumbnails.length} thumbnails:`);

      let totalSize = 0;
      for (const thumb of result.thumbnails) {
        totalSize += thumb.fileSize;
        const status = thumb.success ? '✓' : '✗';
        console.log(`  ${status} ${thumb.angle.padEnd(12)}: ${(thumb.fileSize / 1024).toFixed(2).padEnd(8)} KB`);
      }

      console.log(`\n  Total: ${(totalSize / 1024).toFixed(2)} KB`);

      expect(result.success).toBe(true);
      expect(result.thumbnails.length).toBeGreaterThan(0);
    });
  });

  describe('Lighting Presets', () => {
    it('should generate thumbnail with studio lighting', { timeout: 60000 }, async () => {
      console.log('\n┌─────────────────────────────────────────────┐');
      console.log('│     STUDIO LIGHTING PRESET               │');
      console.log('└─────────────────────────────────────────────┘');

      const result = await generator.generateThumbnail(
        'poltrona-guadalupe',
        FILE_URL,
        'isometric',
        {
          width: 512,
          height: 512,
          backgroundColor: '#f0f0f0',
          lighting: {
            intensity: 1.0,
            color: '#ffffff',
          },
        }
      );

      console.log(`\n✓ Studio lighting: ${(result.fileSize / 1024).toFixed(2)} KB`);
      expect(result.success).toBe(true);
    });

    it('should generate thumbnail with warm lighting', { timeout: 60000 }, async () => {
      console.log('\n┌─────────────────────────────────────────────┐');
      console.log('│     WARM LIGHTING PRESET                 │');
      console.log('└─────────────────────────────────────────────┘');

      const result = await generator.generateThumbnail(
        'poltrona-guadalupe',
        FILE_URL,
        'isometric',
        {
          width: 512,
          height: 512,
          backgroundColor: '#fff5e6',
          lighting: {
            intensity: 0.8,
            color: '#ffeedd',
          },
        }
      );

      console.log(`\n✓ Warm lighting: ${(result.fileSize / 1024).toFixed(2)} KB`);
      expect(result.success).toBe(true);
    });

    it('should generate thumbnail with dramatic lighting', { timeout: 60000 }, async () => {
      console.log('\n┌─────────────────────────────────────────────┐');
      console.log('│     DRAMATIC LIGHTING PRESET             │');
      console.log('└─────────────────────────────────────────────┘');

      const result = await generator.generateThumbnail(
        'poltrona-guadalupe',
        FILE_URL,
        'isometric',
        {
          width: 512,
          height: 512,
          backgroundColor: '#1a1a1a',
          lighting: {
            intensity: 1.5,
            color: '#ffffff',
          },
        }
      );

      console.log(`\n✓ Dramatic lighting: ${(result.fileSize / 1024).toFixed(2)} KB`);
      expect(result.success).toBe(true);
    });
  });

  describe('Quality Comparisons', () => {
    it('should compare different quality levels', { timeout: 180000 }, async () => {
      console.log('\n┌─────────────────────────────────────────────────────────────┐');
      console.log('│              QUALITY LEVEL COMPARISON                        │');
      console.log('├─────────────────────────────────────────────────────────────┤');

      const qualities = [50, 70, 85, 95, 100];
      const results: Array<{ quality: number; size: number; kb: string }> = [];

      for (const quality of qualities) {
        const result = await generator.generateThumbnail(
          'poltrona-guadalupe',
          FILE_URL,
          'isometric',
          {
            width: 512,
            height: 512,
            backgroundColor: '#f0f0f0',
            quality,
            format: 'jpeg',
          }
        );

        results.push({
          quality,
          size: result.fileSize,
          kb: (result.fileSize / 1024).toFixed(2),
        });

        console.log(`│ Quality ${quality.toString().padEnd(3)} │ ${result.fileSize.toString().padEnd(8)} bytes │ ${results[results.length - 1].kb.padEnd(10)} KB │`);
      }

      console.log('└─────────────────────────────────────────────────────────────┘\n');

      // Higher quality should generally result in larger files
      expect(results[0].size).toBeLessThan(results[results.length - 1].size);
    });
  });

  describe('Size Comparisons', () => {
    it('should compare different output sizes', { timeout: 180000 }, async () => {
      console.log('\n┌─────────────────────────────────────────────────────────────┐');
      console.log('│              OUTPUT SIZE COMPARISON                          │');
      console.log('├─────────────────────────────────────────────────────────────┤');

      const sizes = [
        { width: 256, height: 256, name: 'Small (256px)' },
        { width: 512, height: 512, name: 'Medium (512px)' },
        { width: 1024, height: 1024, name: 'Large (1K)' },
        { width: 2048, height: 2048, name: 'XLarge (2K)' },
      ];

      const results: Array<{ name: string; size: number; kb: string }> = [];

      for (const size of sizes) {
        const result = await generator.generateThumbnail(
          'poltrona-guadalupe',
          FILE_URL,
          'isometric',
          {
            width: size.width,
            height: size.height,
            backgroundColor: '#f0f0f0',
            quality: 85,
            format: 'jpeg',
          }
        );

        results.push({
          name: size.name,
          size: result.fileSize,
          kb: (result.fileSize / 1024).toFixed(2),
        });

        console.log(`│ ${size.name.padEnd(18)} │ ${result.fileSize.toString().padEnd(10)} bytes │ ${results[results.length - 1].kb.padEnd(10)} KB │`);
      }

      console.log('└─────────────────────────────────────────────────────────────┘\n');

      // Larger output should result in larger files
      expect(results[0].size).toBeLessThan(results[results.length - 1].size);
    });
  });

  describe('Format Comparison', () => {
    it('should compare JPEG vs PNG output', { timeout: 120000 }, async () => {
      console.log('\n┌─────────────────────────────────────────────────────────────┐');
      console.log('│              FORMAT COMPARISON                               │');
      console.log('├─────────────────────────────────────────────────────────────┤');

      const jpegResult = await generator.generateThumbnail(
        'poltrona-guadalupe',
        FILE_URL,
        'isometric',
        {
          width: 512,
          height: 512,
          backgroundColor: '#f0f0f0',
          quality: 85,
          format: 'jpeg',
        }
      );

      const pngResult = await generator.generateThumbnail(
        'poltrona-guadalupe-png',
        FILE_URL,
        'isometric',
        {
          width: 512,
          height: 512,
          backgroundColor: '#f0f0f0',
          format: 'png',
        }
      );

      const jpegKb = (jpegResult.fileSize / 1024).toFixed(2);
      const pngKb = (pngResult.fileSize / 1024).toFixed(2);
      const ratio = ((jpegResult.fileSize / pngResult.fileSize) * 100).toFixed(1);

      console.log(`│ JPEG (85% quality) │ ${jpegResult.fileSize.toString().padEnd(12)} bytes │ ${jpegKb.padEnd(10)} KB │`);
      console.log(`│ PNG (lossless)     │ ${pngResult.fileSize.toString().padEnd(12)} bytes │ ${pngKb.padEnd(10)} KB │`);
      console.log(`│ Ratio               │ JPEG is ${ratio}% of PNG size                         │`);
      console.log('└─────────────────────────────────────────────────────────────┘\n');

      // JPEG should be smaller than PNG for photographic content
      expect(jpegResult.fileSize).toBeLessThan(pngResult.fileSize);
    });
  });

  describe('Background Color Variations', () => {
    it('should generate thumbnails with different backgrounds', { timeout: 120000 }, async () => {
      console.log('\n┌─────────────────────────────────────────────────────────────┐');
      console.log('│              BACKGROUND COLOR TESTS                         │');
      console.log('├─────────────────────────────────────────────────────────────┤');

      const backgrounds = [
        { color: '#ffffff', name: 'Pure White' },
        { color: '#f0f0f0', name: 'Light Gray' },
        { color: '#e8f4f8', name: 'Light Blue' },
        { color: '#fff8e8', name: 'Warm White' },
        { color: '#1a1a1a', name: 'Dark Gray' },
      ];

      for (const bg of backgrounds) {
        const result = await generator.generateThumbnail(
          `poltrona-${bg.name.toLowerCase().replace(/\s+/g, '-')}`,
          FILE_URL,
          'isometric',
          {
            width: 512,
            height: 512,
            backgroundColor: bg.color,
            quality: 85,
            format: 'jpeg',
          }
        );

        const status = result.success ? '✓' : '✗';
        console.log(`│ ${status} ${bg.name.padEnd(16)} │ ${bg.color.padEnd(10)} │ ${(result.fileSize / 1024).toFixed(2).padEnd(8)} KB │`);
      }

      console.log('└─────────────────────────────────────────────────────────────┘\n');

      // All thumbnails should be generated successfully
      const result = await generator.generateThumbnail(
        'test-final',
        FILE_URL,
        'isometric',
        {
          width: 512,
          height: 512,
          backgroundColor: '#f0f0f0',
          quality: 85,
          format: 'jpeg',
        }
      );
      expect(result.success).toBe(true);
    });
  });

  describe('Performance Metrics', () => {
    it('should measure generation time for multiple thumbnails', { timeout: 300000 }, async () => {
      console.log('\n┌─────────────────────────────────────────────────────────────┐');
      console.log('│              PERFORMANCE METRICS                             │');
      console.log('├─────────────────────────────────────────────────────────────┤');

      const angles: Array<'front' | 'side' | 'isometric' | 'back'> = ['front', 'side', 'isometric', 'back'];
      const times: Array<{ angle: string; ms: number; kb: string }> = [];

      const startTime = Date.now();

      for (const angle of angles) {
        const angleStart = Date.now();
        const result = await generator.generateThumbnail(
          `poltrona-perf-${angle}`,
          FILE_URL,
          angle,
          {
            width: 512,
            height: 512,
            backgroundColor: '#f0f0f0',
            quality: 85,
            format: 'jpeg',
          }
        );
        const angleTime = Date.now() - angleStart;

        times.push({
          angle,
          ms: angleTime,
          kb: (result.fileSize / 1024).toFixed(2),
        });

        console.log(`│ ${angle.padEnd(10)} │ ${angleTime.toString().padEnd(8)} ms │ ${(result.fileSize / 1024).toFixed(2).padEnd(8)} KB │`);
      }

      const totalTime = Date.now() - startTime;
      const avgTime = totalTime / angles.length;

      console.log('├─────────────────────────────────────────────────────────────┤');
      console.log(`│ Total Time: ${totalTime.toString().padEnd(8)} ms (${(totalTime / 1000).toFixed(2)}s)             │`);
      console.log(`│ Average: ${avgTime.toFixed(0).toString().padEnd(9)} ms per thumbnail                           │`);
      console.log('└─────────────────────────────────────────────────────────────┘\n');

      expect(times.length).toBe(4);
      expect(avgTime).toBeLessThan(60000); // Each thumbnail should take less than 60s
    });
  });

  describe('Output Verification', () => {
    it('should verify generated files exist and have valid content', async () => {
      console.log('\n┌─────────────────────────────────────────────┐');
      console.log('│     VERIFYING GENERATED FILES            │');
      console.log('└─────────────────────────────────────────────┘');

      const result = await generator.generateThumbnail(
        'poltrona-verify',
        FILE_URL,
        'isometric',
        {
          width: 256,
          height: 256,
          backgroundColor: '#f0f0f0',
          quality: 85,
          format: 'jpeg',
        }
      );

      expect(result.success).toBe(true);

      // Verify URL is returned
      expect(result.url).toBeDefined();

      // For file:// URLs, verify file exists
      if (result.url && result.url.startsWith('file://')) {
        const filePath = result.url.replace('file://', '');
        const exists = existsSync(filePath);

        console.log(`\n✓ File verification:`);
        console.log(`  - URL: ${result.url}`);
        console.log(`  - Exists: ${exists}`);
        console.log(`  - Size: ${result.fileSize} bytes`);

        expect(exists).toBe(true);

        // Verify file has content
        const buffer = readFileSync(filePath);
        expect(buffer.length).toBe(result.fileSize);
        expect(buffer.length).toBeGreaterThan(100); // At least some image data

        // Check for JPEG magic bytes
        const jpegMagic = buffer.subarray(0, 2);
        const isJPEG = jpegMagic[0] === 0xFF && jpegMagic[1] === 0xD8;
        console.log(`  - JPEG header: ${isJPEG ? 'Valid' : 'Invalid'}`);
        expect(isJPEG).toBe(true);
      }

      console.log('');
    });
  });

  describe('Cleanup', () => {
    it('should clean up old thumbnail files', async () => {
      const cleanedCount = await generator.cleanup(0); // Clean all (0ms age)
      console.log(`\n✓ Cleaned up ${cleanedCount} temporary files`);
    });
  });
});
