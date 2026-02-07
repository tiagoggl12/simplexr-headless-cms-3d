import { describe, it, expect, beforeEach } from 'vitest';
import { LODGenerator, DEFAULT_LOD_CONFIGS } from '../src/services/lod-generator.js';

describe('LODGenerator', () => {
  let generator: LODGenerator;

  beforeEach(() => {
    generator = new LODGenerator();
  });

  describe('getSwitchDistance', () => {
    it('should return 0 for LOD0', () => {
      const distance = generator.getSwitchDistance(0);
      expect(distance).toBe(0);
    });

    it('should return 10 for LOD1', () => {
      const distance = generator.getSwitchDistance(1);
      expect(distance).toBe(10);
    });

    it('should return 50 for LOD2', () => {
      const distance = generator.getSwitchDistance(2);
      expect(distance).toBe(50);
    });

    it('should return 0 for unknown LOD level', () => {
      const distance = generator.getSwitchDistance(99);
      expect(distance).toBe(0);
    });
  });

  describe('getRecommendedMaxLOD', () => {
    it('should return LOD2 for high-end desktop', () => {
      const maxLOD = generator.getRecommendedMaxLOD({
        isMobile: false,
        gpuTier: 'high',
      });

      expect(maxLOD).toBe(2);
    });

    it('should return LOD1 for medium-end desktop', () => {
      const maxLOD = generator.getRecommendedMaxLOD({
        isMobile: false,
        gpuTier: 'medium',
      });

      expect(maxLOD).toBe(1);
    });

    it('should return LOD1 for mobile devices', () => {
      const maxLOD = generator.getRecommendedMaxLOD({
        isMobile: true,
        gpuTier: 'high',
      });

      expect(maxLOD).toBe(1);
    });

    it('should return LOD1 for low-end devices', () => {
      const maxLOD = generator.getRecommendedMaxLOD({
        isMobile: false,
        gpuTier: 'low',
      });

      expect(maxLOD).toBe(1);
    });

    it('should default to LOD1 when no info provided', () => {
      const maxLOD = generator.getRecommendedMaxLOD({});

      expect(maxLOD).toBe(1);
    });
  });

  describe('estimateFileSize', () => {
    it('should estimate LOD0 size as same as original', () => {
      const estimated = generator.estimateFileSize(1024000, 1.0);
      // (1024000 - 1024) * 1.0 + 1024 = 1024000
      expect(estimated).toBe(1024000);
    });

    it('should estimate LOD1 size as half of original', () => {
      const estimated = generator.estimateFileSize(1024000, 0.5);
      // (1024000 - 1024) * 0.5 + 1024 = 511488 + 1024 = 512512
      expect(estimated).toBe(512512);
    });

    it('should estimate LOD2 size as quarter of original', () => {
      const estimated = generator.estimateFileSize(1024000, 0.25);
      // (1024000 - 1024) * 0.25 + 1024 = 255744 + 1024 = 256768
      expect(estimated).toBe(256768);
    });
  });

  describe('validateLOD', () => {
    it('should validate a valid GLB file', () => {
      // glTF magic bytes in little-endian
      const buffer = Buffer.from([
        0x67, 0x6C, 0x54, 0x46, // 'glTF'
        0x02, 0x00, 0x00, 0x00, // version
        0x20, 0x00, 0x00, 0x00, // length
      ]);

      const isValid = generator.validateLOD(buffer, 0);

      expect(isValid).toBe(true);
    });

    it('should reject invalid GLB file', () => {
      const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);

      const isValid = generator.validateLOD(buffer, 0);

      expect(isValid).toBe(false);
    });
  });

  describe('DEFAULT_LOD_CONFIGS', () => {
    it('should have 3 LOD levels', () => {
      expect(DEFAULT_LOD_CONFIGS).toHaveLength(3);
    });

    it('should have correct configuration for LOD0', () => {
      const lod0 = DEFAULT_LOD_CONFIGS[0];
      expect(lod0.level).toBe(0);
      expect(lod0.ratio).toBe(1.0);
      expect(lod0.distance).toBe(0);
    });

    it('should have correct configuration for LOD1', () => {
      const lod1 = DEFAULT_LOD_CONFIGS[1];
      expect(lod1.level).toBe(1);
      expect(lod1.ratio).toBe(0.5);
      expect(lod1.distance).toBe(10);
    });

    it('should have correct configuration for LOD2', () => {
      const lod2 = DEFAULT_LOD_CONFIGS[2];
      expect(lod2.level).toBe(2);
      expect(lod2.ratio).toBe(0.25);
      expect(lod2.distance).toBe(50);
    });
  });
});
