import { describe, it, expect, beforeEach } from 'vitest';
import { KTX2Processor } from '../src/services/ktx-processor.js';

describe('KTX2Processor', () => {
  let processor: KTX2Processor;

  beforeEach(() => {
    processor = new KTX2Processor();
  });

  describe('detectCapabilities', () => {
    it('should detect Chrome browser with KTX2 support', () => {
      const capabilities = processor.detectCapabilities(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      expect(capabilities.browser).toBe('chrome');
      expect(capabilities.supportsKtx2).toBe(true);
    });

    it('should detect Firefox browser with KTX2 support', () => {
      const capabilities = processor.detectCapabilities(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
      );

      expect(capabilities.browser).toBe('firefox');
      expect(capabilities.supportsKtx2).toBe(true);
    });

    it('should detect Safari browser', () => {
      const capabilities = processor.detectCapabilities(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
      );

      expect(capabilities.browser).toBe('safari');
      expect(capabilities.supportsKtx2).toBe(true);
    });

    it('should return default capabilities when no UA provided', () => {
      const capabilities = processor.detectCapabilities();

      expect(capabilities.browser).toBe('unknown');
      expect(capabilities.supportsKtx2).toBe(true);
    });
  });

  describe('getSupportedFormats', () => {
    it('should return all formats for a capable device', () => {
      const formats = processor.getSupportedFormats({
        supportsKtx2: true,
        supportsBasis: true,
        gpu: 'nvidia',
        browser: 'chrome',
      });

      expect(formats).toContain('glb');
      expect(formats).toContain('ktx2');
      expect(formats).toContain('basis');
    });

    it('should return only GLB for devices without KTX2 support', () => {
      const formats = processor.getSupportedFormats({
        supportsKtx2: false,
        supportsBasis: false,
        gpu: 'unknown',
        browser: 'unknown',
      });

      expect(formats).toEqual(['glb']);
    });
  });

  describe('validateKTX2', () => {
    it('should validate a correct KTX2 file', () => {
      // KTX2 magic bytes: «KTX 20»\r\n\x1a\n
      const buffer = Buffer.from([
        0xAB, 0x4B, 0x54, 0x58, 0x20, 0x32, 0xBB, 0x0D, 0x0A, 0x1A, 0x0A,
      ]);

      const isValid = processor.validateKTX2(buffer);

      expect(isValid).toBe(true);
    });

    it('should reject invalid KTX2 file', () => {
      const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);

      const isValid = processor.validateKTX2(buffer);

      expect(isValid).toBe(false);
    });

    it('should reject buffer that is too small', () => {
      const buffer = Buffer.from([0xAB, 0x4B]);

      const isValid = processor.validateKTX2(buffer);

      expect(isValid).toBe(false);
    });
  });
});
