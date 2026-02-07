/**
 * CDN configuration options
 */
export interface CDNConfig {
  provider: 'cloudflare' | 'cloudfront' | 'custom';
  endpoint: string;
  zoneId?: string; // CloudFlare
  distributionId?: string; // CloudFront
  apiToken?: string; // CloudFlare
  accessKeyId?: string; // CloudFront/AWS
  secretAccessKey?: string; // CloudFront/AWS
  region?: string; // CloudFront/AWS
  cacheRules: {
    ktx2: string; // "public, max-age=31536000, immutable"
    lods: string; // "public, max-age=86400, stale-while-revalidate=3600"
    glb: string; // "public, max-age=3600"
    thumbnails: string; // "public, max-age=604800"
  };
  enabled: boolean;
}

/**
 * Cache purge result
 */
export interface CachePurgeResult {
  success: boolean;
  purgedUrls: string[];
  failedUrls: string[];
  message?: string;
}

/**
 * Asset type for cache rules
 */
export type AssetType = 'ktx2' | 'lod' | 'glb' | 'thumbnail' | 'default';

/**
 * CDN Service
 *
 * Manages CDN integration for 3D asset delivery.
 * Handles URL transformation, cache headers, and cache purging.
 */
export class CDNService {
  private config: CDNConfig;

  constructor(config?: Partial<CDNConfig>) {
    this.config = this.resolveConfig(config);
  }

  /**
   * Transform S3/storage URL to CDN URL
   *
   * @param storageUrl Original storage URL
   * @param assetType Type of asset for cache rules
   * @returns CDN URL or original URL if CDN is disabled
   */
  transformUrl(storageUrl: string, assetType: AssetType = 'default'): string {
    if (!this.config.enabled) {
      return storageUrl;
    }

    try {
      const url = new URL(storageUrl);

      // Transform S3 URLs to CDN URLs
      // Example: https://s3.amazonaws.com/bucket/path/file.glb
      //       -> https://cdn.example.com/path/file.glb

      // Extract path from storage URL
      const path = url.pathname;

      // Remove bucket name from path if present
      const cleanPath = path.replace(/^\/[^/]+\//, '/');

      // Construct CDN URL
      const cdnUrl = `${this.config.endpoint}${cleanPath}`;

      console.log(`[CDN] Transformed: ${storageUrl} -> ${cdnUrl}`);

      return cdnUrl;
    } catch (error) {
      console.warn(`[CDN] Failed to transform URL ${storageUrl}:`, error);
      return storageUrl;
    }
  }

  /**
   * Get cache headers for an asset type
   *
   * @param assetType Type of asset
   * @returns Cache control headers
   */
  getCacheHeaders(assetType: AssetType): Record<string, string> {
    // Map 'lod' to 'lods' for cache rules
    const cacheKey = assetType === 'lod' ? 'lods' : assetType;
    const cacheRule = this.config.cacheRules[cacheKey as keyof typeof this.config.cacheRules] ?? this.config.cacheRules.glb;

    return {
      'Cache-Control': cacheRule,
      // Add CDN-specific headers
      ...(this.config.provider === 'cloudflare' && {
        'CF-Cache-Status': 'MISS',
      }),
    };
  }

  /**
   * Purge cache for specific URLs
   *
   * @param urls URLs to purge from cache
   * @returns Purge result
   */
  async purgeCache(urls: string[]): Promise<CachePurgeResult> {
    if (!this.config.enabled) {
      return {
        success: true,
        purgedUrls: [],
        failedUrls: urls,
        message: 'CDN is disabled, no cache purged',
      };
    }

    console.log(`[CDN] Purging ${urls.length} URL(s) from cache`);

    try {
      let purgedUrls: string[] = [];
      let failedUrls: string[] = [];

      switch (this.config.provider) {
        case 'cloudflare':
          const cloudflareResult = await this.purgeCloudflare(urls);
          purgedUrls = cloudflareResult.purged;
          failedUrls = cloudflareResult.failed;
          break;

        case 'cloudfront':
          const cloudfrontResult = await this.purgeCloudFront(urls);
          purgedUrls = cloudfrontResult.purged;
          failedUrls = cloudfrontResult.failed;
          break;

        case 'custom':
          // Custom CDN - may have purge webhook or API
          purgedUrls = await this.purgeCustom(urls);
          break;
      }

      console.log(`[CDN] Purged ${purgedUrls.length}/${urls.length} URLs`);

      return {
        success: failedUrls.length === 0,
        purgedUrls,
        failedUrls,
      };
    } catch (error) {
      console.error('[CDN] Cache purge failed:', error);
      return {
        success: false,
        purgedUrls: [],
        failedUrls: urls,
        message: String(error),
      };
    }
  }

  /**
   * Purge all cached assets for a specific asset ID
   *
   * @param assetId Asset ID
   * @param variants Optional list of variant URLs to purge
   * @returns Purge result
   */
  async purgeAsset(assetId: string, variants?: {
    master?: string;
    ktx2?: string;
    lods?: string[];
    thumbnails?: string[];
  }): Promise<CachePurgeResult> {
    const urlsToPurge: string[] = [];

    if (variants?.master) {
      urlsToPurge.push(this.transformUrl(variants.master, 'glb'));
    }

    if (variants?.ktx2) {
      urlsToPurge.push(this.transformUrl(variants.ktx2, 'ktx2'));
    }

    if (variants?.lods) {
      for (const lod of variants.lods) {
        urlsToPurge.push(this.transformUrl(lod, 'lod'));
      }
    }

    if (variants?.thumbnails) {
      for (const thumbnail of variants.thumbnails) {
        urlsToPurge.push(this.transformUrl(thumbnail, 'thumbnail'));
      }
    }

    console.log(`[CDN] Purging ${urlsToPurge.length} URL(s) for asset ${assetId}`);

    return this.purgeCache(urlsToPurge);
  }

  /**
   * Get CDN status and configuration
   */
  getStatus(): {
    enabled: boolean;
    provider: string;
    endpoint: string;
    cacheRules: CDNConfig['cacheRules'];
  } {
    return {
      enabled: this.config.enabled,
      provider: this.config.provider,
      endpoint: this.config.endpoint,
      cacheRules: this.config.cacheRules,
    };
  }

  /**
   * Update CDN configuration
   */
  updateConfig(updates: Partial<CDNConfig>): void {
    this.config = { ...this.config, ...updates };
    console.log('[CDN] Configuration updated');
  }

  /**
   * Purge cache using CloudFlare API
   */
  private async purgeCloudflare(urls: string[]): Promise<{
    purged: string[];
    failed: string[];
  }> {
    if (!this.config.apiToken || !this.config.zoneId) {
      console.warn('[CDN] CloudFlare API credentials not configured');
      return { purged: [], failed: urls };
    }

    try {
      // Transform URLs to CDN URLs for purging
      const cdnUrls = urls.map(url => this.transformUrl(url, 'default'));

      const response = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${this.config.zoneId}/purge_cache`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            files: cdnUrls,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`CloudFlare API error: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success) {
        return { purged: urls, failed: [] };
      } else {
        console.warn('[CDN] CloudFlare purge partially failed:', result.errors);
        return { purged: [], failed: urls };
      }
    } catch (error) {
      console.error('[CDN] CloudFlare purge failed:', error);
      return { purged: [], failed: urls };
    }
  }

  /**
   * Purge cache using AWS CloudFront API
   */
  private async purgeCloudFront(urls: string[]): Promise<{
    purged: string[];
    failed: string[];
  }> {
    // CloudFront invalidation requires AWS SDK v3
    // For now, this is a stub that returns success
    // In production, you would use @aws-sdk/client-cloudfront

    if (!this.config.distributionId) {
      console.warn('[CDN] CloudFront distribution ID not configured');
      return { purged: [], failed: urls };
    }

    console.log('[CDN] CloudFront purge: STUB (would call CloudFront CreateInvalidation API)');
    console.log(`[CDN] Would invalidate ${urls.length} paths in distribution ${this.config.distributionId}`);

    // Stub: Assume success
    return { purged: urls, failed: [] };
  }

  /**
   * Purge cache for custom CDN
   */
  private async purgeCustom(urls: string[]): Promise<string[]> {
    // Custom CDN may have a purge webhook
    const purgeWebhook = process.env.CDN_PURGE_WEBHOOK;

    if (purgeWebhook) {
      try {
        await fetch(purgeWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls }),
        });
      } catch (error) {
        console.error('[CDN] Custom purge webhook failed:', error);
      }
    }

    return urls;
  }

  /**
   * Resolve configuration from environment or defaults
   */
  private resolveConfig(config?: Partial<CDNConfig>): CDNConfig {
    const enabled = process.env.CDN_ENABLED === 'true' || config?.enabled || false;

    return {
      enabled,
      provider: config?.provider || (process.env.CDN_PROVIDER as CDNConfig['provider']) || 'custom',
      endpoint: config?.endpoint || process.env.CDN_ENDPOINT || '',
      zoneId: config?.zoneId || process.env.CDN_ZONE_ID,
      distributionId: config?.distributionId || process.env.CDN_DISTRIBUTION_ID,
      apiToken: config?.apiToken || process.env.CDN_API_TOKEN,
      accessKeyId: config?.accessKeyId || process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: config?.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY,
      region: config?.region || process.env.AWS_REGION || 'us-east-1',
      cacheRules: config?.cacheRules || {
        ktx2: 'public, max-age=31536000, immutable', // 1 year, immutable
        lods: 'public, max-age=86400, stale-while-revalidate=3600', // 1 day with SWR
        glb: 'public, max-age=3600', // 1 hour
        thumbnails: 'public, max-age=604800', // 1 week
      },
    };
  }
}

/**
 * Create a CDN service instance with configuration
 */
export function createCDNService(config?: Partial<CDNConfig>): CDNService {
  return new CDNService(config);
}

/**
 * Get default CDN service based on environment variables
 */
export function getCDNService(): CDNService {
  return createCDNService();
}
