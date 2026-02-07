import { describe, it, expect, beforeEach } from 'vitest';
import { CDNService } from '../src/services/cdn-service.js';

describe('CDNService', () => {
  describe('with CDN enabled', () => {
    let service: CDNService;

    beforeEach(() => {
      service = new CDNService({
        enabled: true,
        provider: 'custom',
        endpoint: 'https://cdn.example.com',
        cacheRules: {
          ktx2: 'public, max-age=31536000, immutable',
          lods: 'public, max-age=86400, stale-while-revalidate=3600',
          glb: 'public, max-age=3600',
          thumbnails: 'public, max-age=604800',
          default: 'public, max-age=3600',
        },
      });
    });

    describe('transformUrl', () => {
      it('should transform S3 URL to CDN URL', () => {
        const s3Url = 'https://s3.amazonaws.com/bucket/assets/test.glb';
        const cdnUrl = service.transformUrl(s3Url, 'glb');

        expect(cdnUrl).toBe('https://cdn.example.com/assets/test.glb');
      });

      it('should transform S3 URL with bucket in path to CDN URL', () => {
        const s3Url = 'https://s3.amazonaws.com/my-bucket/path/to/file.glb';
        const cdnUrl = service.transformUrl(s3Url, 'glb');

        expect(cdnUrl).toBe('https://cdn.example.com/path/to/file.glb');
      });

      it('should handle MinIO style URLs', () => {
        const minioUrl = 'http://localhost:9000/bucket/assets/test.lod0.glb';
        const cdnUrl = service.transformUrl(minioUrl, 'lod');

        expect(cdnUrl).toBe('https://cdn.example.com/assets/test.lod0.glb');
      });

      it('should return original URL if transformation fails', () => {
        const invalidUrl = 'not-a-valid-url';
        const result = service.transformUrl(invalidUrl, 'default');

        expect(result).toBe(invalidUrl);
      });
    });

    describe('getCacheHeaders', () => {
      it('should return KTX2 cache headers', () => {
        const headers = service.getCacheHeaders('ktx2');

        expect(headers).toEqual({
          'Cache-Control': 'public, max-age=31536000, immutable',
        });
      });

      it('should return LOD cache headers (using lods key)', () => {
        const headers = service.getCacheHeaders('lod' as any);

        expect(headers).toEqual({
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
        });
      });

      it('should return default cache headers for unknown types', () => {
        const headers = service.getCacheHeaders('default' as any);

        expect(headers).toEqual({
          'Cache-Control': 'public, max-age=3600',
        });
      });
    });

    describe('purgeCache', () => {
      it('should return success for disabled CDN with no purge', async () => {
        const disabledService = new CDNService({ enabled: false });
        const result = await disabledService.purgeCache(['https://example.com/file.glb']);

        expect(result.success).toBe(true);
        expect(result.purgedUrls).toEqual([]);
        expect(result.failedUrls).toEqual(['https://example.com/file.glb']);
      });
    });

    describe('purgeAsset', () => {
      it('should return success when no variants provided', async () => {
        const result = await service.purgeAsset('asset-123');

        expect(result.success).toBe(true);
        expect(result.purgedUrls).toEqual([]);
      });

      it('should transform all variant URLs before purging (stub returns success)', async () => {
        const result = await service.purgeAsset('asset-123', {
          master: 'https://s3.amazonaws.com/bucket/asset.glb',
          ktx2: 'https://s3.amazonaws.com/bucket/asset.ktx2.glb',
          lods: [
            'https://s3.amazonaws.com/bucket/asset.lod0.glb',
            'https://s3.amazonaws.com/bucket/asset.lod1.glb',
          ],
        });

        // Stub implementation returns URLs as purged
        expect(result.success).toBe(true);
        expect(result.purgedUrls).toEqual([
          'https://cdn.example.com/asset.glb',
          'https://cdn.example.com/asset.ktx2.glb',
          'https://cdn.example.com/asset.lod0.glb',
          'https://cdn.example.com/asset.lod1.glb',
        ]);
        expect(result.failedUrls).toEqual([]);
      });
    });

    describe('getStatus', () => {
      it('should return CDN status', () => {
        const status = service.getStatus();

        expect(status).toEqual({
          enabled: true,
          provider: 'custom',
          endpoint: 'https://cdn.example.com',
          cacheRules: {
            ktx2: 'public, max-age=31536000, immutable',
            lods: 'public, max-age=86400, stale-while-revalidate=3600',
            glb: 'public, max-age=3600',
            thumbnails: 'public, max-age=604800',
            default: 'public, max-age=3600',
          },
        });
      });
    });

    describe('updateConfig', () => {
      it('should update configuration', () => {
        service.updateConfig({
          endpoint: 'https://new-cdn.example.com',
        });

        const status = service.getStatus();
        expect(status.endpoint).toBe('https://new-cdn.example.com');
      });
    });
  });

  describe('with CDN disabled', () => {
    let service: CDNService;

    beforeEach(() => {
      service = new CDNService({ enabled: false });
    });

    describe('transformUrl', () => {
      it('should return original URL when CDN is disabled', () => {
        const url = 'https://s3.amazonaws.com/bucket/test.glb';
        const result = service.transformUrl(url, 'glb');

        expect(result).toBe(url);
      });
    });

    describe('getStatus', () => {
      it('should return disabled status', () => {
        const status = service.getStatus();

        expect(status.enabled).toBe(false);
      });
    });
  });
});
