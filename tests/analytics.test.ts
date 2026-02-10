/**
 * Analytics Service Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createAnalyticsService } from '../src/services/analytics.service.js';

describe('AnalyticsService', () => {
  let service: ReturnType<typeof createAnalyticsService>;

  beforeEach(() => {
    service = createAnalyticsService();

    // Register test assets
    service.registerAsset('asset-1', 'Chair 1', 'https://example.com/thumb1.jpg');
    service.registerAsset('asset-2', 'Table 2', 'https://example.com/thumb2.jpg');
    service.registerAsset('asset-3', 'Lamp 3');
  });

  describe('Track Events', () => {
    it('should track view event', () => {
      const view = service.trackView('asset-1', {
        duration: 5000,
        referrer: 'https://google.com',
      }, 'user-1', '192.168.1.1');

      expect(view.assetId).toBe('asset-1');
      expect(view.duration).toBe(5000);
    });

    it('should track view with context', () => {
      const view = service.trackView('asset-2', {
        context: {
          device: 'mobile',
          browser: 'Chrome',
          os: 'iOS',
          country: 'BR',
        },
      }, 'user-2');

      expect(view.context?.device).toBe('mobile');
      expect(view.context?.country).toBe('BR');
    });

    it('should track download event', () => {
      service.trackDownload('asset-1', {
        format: 'glb',
        userId: 'user-1',
      });

      const metrics = service.getMetrics('asset-1');
      expect(metrics.downloads).toBe(1);
    });

    it('should track share event', () => {
      service.trackShare('asset-1', {
        platform: 'twitter',
        userId: 'user-1',
      });

      const metrics = service.getMetrics('asset-1');
      expect(metrics.shares).toBe(1);
    });

    it('should hash IP address for privacy', () => {
      const view = service.trackView('asset-1', {}, 'user-1', '192.168.1.100');

      expect(view.ipAddress).not.toBe('192.168.1.100');
      expect(view.ipAddress).toMatch(/^h/);
    });
  });

  describe('Asset Metrics', () => {
    it('should calculate metrics for asset', () => {
      service.trackView('asset-1', { duration: 3000 }, 'user-1');
      service.trackView('asset-1', { duration: 5000 }, 'user-2');
      service.trackView('asset-1', { duration: 2000 }, 'user-1'); // Same user

      service.trackDownload('asset-1', { format: 'glb' }, 'user-1');
      service.trackDownload('asset-1', { format: 'obj' }, 'user-3');

      const metrics = service.getMetrics('asset-1');

      expect(metrics.views).toBe(3);
      expect(metrics.uniqueViews).toBe(2); // user-1 and user-2
      expect(metrics.downloads).toBe(2);
      expect(metrics.avgViewDuration).toBeCloseTo(3333, 0);
    });

    it('should track last viewed and downloaded timestamps', () => {
      const view = service.trackView('asset-1', { duration: 1000 }, 'user-1');
      service.trackDownload('asset-1', { format: 'glb' }, 'user-1');

      const metrics = service.getMetrics('asset-1');

      expect(metrics.lastViewedAt).toBeDefined();
      expect(metrics.lastDownloadedAt).toBeDefined();
    });

    it('should track popular with users', () => {
      service.trackView('asset-1', { duration: 1000 }, 'user-1');
      service.trackView('asset-1', { duration: 1000 }, 'user-2');
      service.trackView('asset-1', { duration: 1000 }, 'user-3');

      const metrics = service.getMetrics('asset-1');

      expect(metrics.popularWith).toContain('user-1');
      expect(metrics.popularWith).toContain('user-2');
      expect(metrics.popularWith).toContain('user-3');
    });
  });

  describe('Popular Assets', () => {
    beforeEach(() => {
      // Generate some test data
      for (let i = 0; i < 10; i++) {
        service.trackView('asset-1', { duration: 1000 }, `user-${i}`);
      }
      for (let i = 0; i < 5; i++) {
        service.trackView('asset-2', { duration: 1000 }, `user-${i}`);
      }
      for (let i = 0; i < 15; i++) {
        service.trackView('asset-3', { duration: 1000 }, `user-${i}`);
      }
    });

    it('should get popular assets sorted by views', () => {
      const popular = service.getPopularAssets({ limit: 10 });

      expect(popular.length).toBe(3);
      expect(popular[0].assetId).toBe('asset-3'); // 15 views
      expect(popular[1].assetId).toBe('asset-1'); // 10 views
      expect(popular[2].assetId).toBe('asset-2'); // 5 views
    });

    it('should include asset names in popular list', () => {
      const popular = service.getPopularAssets();

      expect(popular[0].assetName).toBe('Lamp 3');
      expect(popular[0].thumbnailUrl).toBeUndefined(); // No thumbnail set
    });

    it('should limit results', () => {
      const popular = service.getPopularAssets({ limit: 2 });

      expect(popular.length).toBe(2);
    });

    it('should sort by downloads', () => {
      service.trackDownload('asset-1', { format: 'glb' });
      service.trackDownload('asset-1', { format: 'obj' });
      service.trackDownload('asset-2', { format: 'glb' });

      const popular = service.getPopularAssets({ limit: 10, sortBy: 'downloads' });

      expect(popular[0].assetId).toBe('asset-1');
    });
  });

  describe('Trending Assets', () => {
    it('should calculate trending assets based on growth', () => {
      // Simulate recent activity for asset-2
      for (let i = 0; i < 20; i++) {
        service.trackView('asset-2', { duration: 1000 }, `user-trend-${i}`);
      }

      const trending = service.getTrendingAssets(5);

      expect(trending.length).toBeGreaterThan(0);
      expect(trending[0].assetId).toBeDefined();
    });

    it('should include trend direction', () => {
      for (let i = 0; i < 10; i++) {
        service.trackView('asset-1', { duration: 1000 }, `user-${i}`);
      }

      const trending = service.getTrendingAssets();

      expect(trending[0].trend).toMatch(/^(up|down|stable)$/);
    });
  });

  describe('Unviewed Assets', () => {
    it('should identify unviewed assets', () => {
      service.trackView('asset-1', { duration: 1000 }, 'user-1');

      const unviewed = service.getUnviewedAssets(['asset-1', 'asset-2', 'asset-3']);

      expect(unviewed).toContain('asset-2');
      expect(unviewed).toContain('asset-3');
      expect(unviewed).not.toContain('asset-1');
    });

    it('should return empty array when all viewed', () => {
      service.trackView('asset-1', {}, 'user-1');
      service.trackView('asset-2', {}, 'user-2');
      service.trackView('asset-3', {}, 'user-3');

      const unviewed = service.getUnviewedAssets(['asset-1', 'asset-2', 'asset-3']);

      expect(unviewed).toHaveLength(0);
    });
  });

  describe('Time Series', () => {
    it('should get daily time series data', () => {
      service.trackView('asset-1', { duration: 1000 }, 'user-1');

      const timeSeries = service.getTimeSeries('asset-1', 'day', 30);

      expect(timeSeries).toBeDefined();
      expect(Array.isArray(timeSeries)).toBe(true);
    });

    it('should aggregate by different time periods', () => {
      const hourly = service.getTimeSeries('asset-1', 'hour', 24);
      const daily = service.getTimeSeries('asset-1', 'day', 7);
      const weekly = service.getTimeSeries('asset-1', 'week', 4);

      expect(Array.isArray(hourly)).toBe(true);
      expect(Array.isArray(daily)).toBe(true);
      expect(Array.isArray(weekly)).toBe(true);
    });

    it('should include views, downloads, and duration in time series', () => {
      service.trackView('asset-1', { duration: 5000 }, 'user-1');
      service.trackDownload('asset-1', { format: 'glb' });

      const timeSeries = service.getTimeSeries('asset-1', 'day', 1);

      if (timeSeries.length > 0) {
        expect(timeSeries[0]).toHaveProperty('views');
        expect(timeSeries[0]).toHaveProperty('downloads');
        expect(timeSeries[0]).toHaveProperty('avgDuration');
      }
    });
  });

  describe('Dashboard Data', () => {
    beforeEach(() => {
      for (let i = 0; i < 50; i++) {
        service.trackView('asset-1', { duration: 3000 }, `user-${i}`);
        service.trackView('asset-2', { duration: 2000 }, `user-${i % 25}`);
      }
      for (let i = 0; i < 20; i++) {
        service.trackDownload('asset-1', { format: 'glb' }, `user-${i}`);
      }
    });

    it('should get dashboard overview', () => {
      const dashboard = service.getDashboardData();

      expect(dashboard.overview.totalViews).toBe(100);
      expect(dashboard.overview.totalDownloads).toBe(20);
      expect(dashboard.overview.totalAssets).toBe(2);
    });

    it('should include popular assets in dashboard', () => {
      const dashboard = service.getDashboardData();

      expect(dashboard.popularAssets.length).toBeGreaterThan(0);
      expect(dashboard.popularAssets[0]).toHaveProperty('assetId');
      expect(dashboard.popularAssets[0]).toHaveProperty('views');
    });

    it('should include trending assets in dashboard', () => {
      const dashboard = service.getDashboardData();

      expect(dashboard.trendingAssets.length).toBeGreaterThan(0);
    });

    it('should include time series in dashboard', () => {
      const dashboard = service.getDashboardData();

      expect(dashboard.timeSeries).toBeDefined();
      expect(Array.isArray(dashboard.timeSeries)).toBe(true);
    });

    it('should include recent activity', () => {
      const dashboard = service.getDashboardData();

      expect(dashboard.recentActivity).toBeDefined();
      expect(Array.isArray(dashboard.recentActivity)).toBe(true);
    });

    it('should include top categories', () => {
      const dashboard = service.getDashboardData();

      expect(dashboard.topCategories).toBeDefined();
      expect(Array.isArray(dashboard.topCategories)).toBe(true);
    });
  });

  describe('Summary', () => {
    it('should get analytics summary', () => {
      for (let i = 0; i < 10; i++) {
        service.trackView('asset-1', { duration: 2000 }, `user-${i}`);
      }

      const summary = service.getSummary();

      expect(summary.totalAssets).toBe(1);
      expect(summary.totalViews).toBeGreaterThan(0);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup old analytics data', () => {
      // Track some views
      service.trackView('asset-1', { duration: 1000 }, 'user-1');

      // Cleanup data older than 90 days
      service.cleanup(90);

      // Recent views should still be accessible
      const metrics = service.getMetrics('asset-1');
      expect(metrics.views).toBeGreaterThan(0);
    });
  });

  describe('Helper Functions', () => {
    it('should format duration correctly', async () => {
      const { formatDuration } = await import('../src/models/analytics.js');

      expect(formatDuration(1000)).toBe('1s');
      expect(formatDuration(60000)).toBe('1m 0s');
      expect(formatDuration(3661000)).toBe('1h 1m');
    });
  });
});
