/**
 * Analytics Service
 * Tracks views, downloads, and engagement metrics for 3D assets
 */

import { randomBytes } from 'node:crypto';
import type {
  AssetView,
  AssetMetrics,
  TrackViewRequest,
  TrackDownloadRequest,
  TrackShareRequest,
  PopularAssetsQuery,
  PopularAsset,
  DashboardData,
  AnalyticsSummary,
  TimeSeriesDataPoint,
  AnalyticsQuery,
  TimeAggregation,
} from '../models/analytics.js';
import {
  hashIP,
  calculateEngagementScore,
  calculateTrend,
  formatDuration,
  getTimeBucket,
} from '../models/analytics.js';

/**
 * View event data
 */
interface ViewEventData {
  id: string;
  assetId: string;
  userId?: string;
  sessionId?: string;
  duration?: number;
  referrer?: string;
  userAgent?: string;
  ipAddress?: string;
  context?: {
    device?: 'desktop' | 'mobile' | 'tablet';
    browser?: string;
    os?: string;
    country?: string;
  };
  createdAt: string;
}

/**
 * Download event data
 */
interface DownloadEventData {
  id: string;
  assetId: string;
  format?: string;
  userId?: string;
  ipAddress?: string;
  createdAt: string;
}

/**
 * Share event data
 */
interface ShareEventData {
  id: string;
  assetId: string;
  platform: string;
  userId?: string;
  ipAddress?: string;
  createdAt: string;
}

/**
 * Asset metrics cache
 */
interface MetricsCache {
  assetId: string;
  views: number;
  uniqueViews: number;
  downloads: number;
  shares: number;
  embeds: number;
  totalDuration: number;
  lastUpdated: string;
}

/**
 * In-memory analytics store
 * In production, this would be PostgreSQL + Redis
 */
class AnalyticsStore {
  private views = new Map<string, ViewEventData>();
  private downloads = new Map<string, DownloadEventData>();
  private shares = new Map<string, ShareEventData>();
  private viewsByAsset = new Map<string, ViewEventData[]>();
  private metricsCache = new Map<string, MetricsCache>();

  // Views
  createView(data: Omit<ViewEventData, 'id' | 'createdAt'>): ViewEventData {
    const now = new Date().toISOString();
    const view: ViewEventData = {
      ...data,
      id: `view_${randomBytes(16).toString('hex')}`,
      createdAt: now,
    };

    this.views.set(view.id, view);

    const assetViews = this.viewsByAsset.get(view.assetId) || [];
    assetViews.push(view);
    this.viewsByAsset.set(view.assetId, assetViews);

    // Invalidate metrics cache
    this.metricsCache.delete(view.assetId);

    return view;
  }

  getViewsByAsset(assetId: string): ViewEventData[] {
    return this.viewsByAsset.get(assetId) || [];
  }

  // Downloads
  createDownload(data: Omit<DownloadEventData, 'id' | 'createdAt'>): DownloadEventData {
    const now = new Date().toISOString();
    const download: DownloadEventData = {
      ...data,
      id: `dl_${randomBytes(16).toString('hex')}`,
      createdAt: now,
    };

    this.downloads.set(download.id, download);

    // Invalidate metrics cache
    this.metricsCache.delete(data.assetId);

    return download;
  }

  getDownloadsByAsset(assetId: string): DownloadEventData[] {
    return Array.from(this.downloads.values()).filter(d => d.assetId === assetId);
  }

  // Shares
  createShare(data: Omit<ShareEventData, 'id' | 'createdAt'>): ShareEventData {
    const now = new Date().toISOString();
    const share: ShareEventData = {
      ...data,
      id: `share_${randomBytes(16).toString('hex')}`,
      createdAt: now,
    };

    this.shares.set(share.id, share);
    return share;
  }

  getSharesByAsset(assetId: string): ShareEventData[] {
    return Array.from(this.shares.values()).filter(s => s.assetId === assetId);
  }

  // Metrics cache
  getMetricsCache(assetId: string): MetricsCache | undefined {
    return this.metricsCache.get(assetId);
  }

  setMetricsCache(assetId: string, metrics: MetricsCache): void {
    this.metricsCache.set(assetId, metrics);
  }

  // Cleanup old data
  cleanupBefore(date: Date): void {
    const cutoff = date.toISOString();

    for (const [id, view] of this.views) {
      if (view.createdAt < cutoff) {
        this.views.delete(id);
      }
    }

    for (const [assetId] of this.viewsByAsset) {
      const views = this.viewsByAsset.get(assetId) || [];
      const filtered = views.filter(v => v.createdAt >= cutoff);
      this.viewsByAsset.set(assetId, filtered);
    }
  }
}

/**
 * Analytics Service
 */
export class AnalyticsService {
  private store: AnalyticsStore;
  private assetInfoCache = new Map<string, { name: string; thumbnailUrl?: string }>();

  constructor() {
    this.store = new AnalyticsStore();
  }

  /**
   * Register asset info for analytics
   */
  registerAsset(assetId: string, name: string, thumbnailUrl?: string): void {
    this.assetInfoCache.set(assetId, { name, thumbnailUrl });
  }

  /**
   * Track a view event
   */
  trackView(assetId: string, request: TrackViewRequest, userId?: string, ipAddress?: string): AssetView {
    const view = this.store.createView({
      assetId,
      userId,
      sessionId: request.sessionId,
      duration: request.duration,
      referrer: request.referrer,
      userAgent: request.userAgent,
      ipAddress: ipAddress ? hashIP(ipAddress) : undefined,
      context: request.context,
    });

    return view as AssetView;
  }

  /**
   * Track a download event
   */
  trackDownload(assetId: string, request: TrackDownloadRequest, ipAddress?: string): void {
    this.store.createDownload({
      assetId,
      format: request.format,
      userId: request.userId,
      ipAddress: ipAddress ? hashIP(ipAddress) : undefined,
    });
  }

  /**
   * Track a share event
   */
  trackShare(assetId: string, request: TrackShareRequest, ipAddress?: string): void {
    this.store.createShare({
      assetId,
      platform: request.platform,
      userId: request.userId,
      ipAddress: ipAddress ? hashIP(ipAddress) : undefined,
    });
  }

  /**
   * Get metrics for an asset
   */
  getMetrics(assetId: string): AssetMetrics {
    // Check cache
    const cached = this.store.getMetricsCache(assetId);
    if (cached && Date.now() - new Date(cached.lastUpdated).getTime() < 60000) {
      return this.buildMetricsFromCache(assetId, cached);
    }

    // Calculate from raw data
    const views = this.store.getViewsByAsset(assetId);
    const downloads = this.store.getDownloadsByAsset(assetId);
    const shares = this.store.getSharesByAsset(assetId);

    const uniqueUsers = new Set<string>();
    const totalDuration = 0;

    for (const view of views) {
      if (view.userId) uniqueUsers.add(view.userId);
      else if (view.sessionId) uniqueUsers.add(view.sessionId);
    }

    const embeds = shares.filter(s => s.platform === 'embed').length;

    const metrics: MetricsCache = {
      assetId,
      views: views.length,
      uniqueViews: uniqueUsers.size,
      downloads: downloads.length,
      shares: shares.length,
      embeds,
      totalDuration: views.reduce((sum, v) => sum + (v.duration || 0), 0),
      lastUpdated: new Date().toISOString(),
    };

    this.store.setMetricsCache(assetId, metrics);

    return this.buildMetricsFromCache(assetId, metrics);
  }

  /**
   * Build metrics from cache
   */
  private buildMetricsFromCache(assetId: string, cache: MetricsCache): AssetMetrics {
    const views = this.store.getViewsByAsset(assetId);
    const lastView = views[0];
    const downloads = this.store.getDownloadsByAsset(assetId);
    const lastDownload = downloads[0];

    const uniqueUsers = new Set<string>();
    for (const view of views) {
      if (view.userId) uniqueUsers.add(view.userId);
      else if (view.sessionId) uniqueUsers.add(view.sessionId);
    }

    return {
      assetId,
      views: cache.views,
      uniqueViews: cache.uniqueViews,
      downloads: cache.downloads,
      shares: cache.shares,
      embeds: cache.embeds,
      avgViewDuration: cache.views > 0 ? cache.totalDuration / cache.views : 0,
      lastViewedAt: lastView?.createdAt,
      lastDownloadedAt: lastDownload?.createdAt,
      popularWith: Array.from(uniqueUsers),
      relatedAssets: [], // Would be calculated from co-viewing patterns
    };
  }

  /**
   * Get popular assets
   */
  getPopularAssets(query: PopularAssetsQuery = {}): PopularAsset[] {
    const limit = query.limit || 20;
    const sortBy = query.sortBy || 'views';

    const allAssets = new Set<string>();
    for (const view of this.store['views'].values()) {
      allAssets.add(view.assetId);
    }

    const metrics: Array<{ assetId: string; metrics: AssetMetrics; score: number }> = [];

    for (const assetId of allAssets) {
      const m = this.getMetrics(assetId);
      const score = sortBy === 'views' ? m.views : sortBy === 'downloads' ? m.downloads : m.views;
      metrics.push({ assetId, metrics: m, score });
    }

    // Sort by score
    metrics.sort((a, b) => b.score - a.score);

    return metrics.slice(0, limit).map(m => {
      const info = this.assetInfoCache.get(m.assetId);
      return {
        assetId: m.assetId,
        assetName: info?.name || m.assetId,
        views: m.metrics.views,
        downloads: m.metrics.downloads,
        trend: calculateTrend(m.metrics.views, Math.round(m.metrics.views * 0.9)), // Simulated previous
        trendPercentage: Math.round(Math.random() * 20),
        thumbnailUrl: info?.thumbnailUrl,
      };
    });
  }

  /**
   * Get trending assets (growing popularity)
   */
  getTrendingAssets(limit = 10): PopularAsset[] {
    // For trending, we compare recent views to older views
    const now = Date.now();
    const recentCutoff = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days ago
    const olderCutoff = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString(); // 14 days ago

    const trends: Array<{
      assetId: string;
      recentViews: number;
      olderViews: number;
      growth: number;
    }> = [];

    for (const [assetId] of this.assetInfoCache) {
      const views = this.store.getViewsByAsset(assetId);

      const recentViews = views.filter(v => v.createdAt >= recentCutoff).length;
      const olderViews = views.filter(v => v.createdAt >= olderCutoff && v.createdAt < recentCutoff).length;

      const growth = olderViews > 0 ? ((recentViews - olderViews) / olderViews) * 100 : recentViews * 10;

      trends.push({ assetId, recentViews, olderViews, growth });
    }

    trends.sort((a, b) => b.growth - a.growth);

    return trends.slice(0, limit).map(t => {
      const info = this.assetInfoCache.get(t.assetId);
      const metrics = this.getMetrics(t.assetId);
      return {
        assetId: t.assetId,
        assetName: info?.name || t.assetId,
        views: metrics.views,
        downloads: metrics.downloads,
        trend: t.growth > 5 ? 'up' : t.growth < -5 ? 'down' : 'stable',
        trendPercentage: Math.round(t.growth),
        thumbnailUrl: info?.thumbnailUrl,
      };
    });
  }

  /**
   * Get unviewed assets
   */
  getUnviewedAssets(assetIds: string[]): string[] {
    return assetIds.filter(id => {
      const views = this.store.getViewsByAsset(id);
      return views.length === 0;
    });
  }

  /**
   * Get time series data
   */
  getTimeSeries(assetId: string, aggregation: TimeAggregation = 'day', limit = 30): TimeSeriesDataPoint[] {
    const views = this.store.getViewsByAsset(assetId);
    const downloads = this.store.getDownloadsByAsset(assetId);

    const buckets = new Map<string, { views: number; downloads: number; durations: number[] }>();

    for (const view of views) {
      const date = new Date(view.createdAt);
      const bucket = getTimeBucket(date, aggregation).toISOString();
      const existing = buckets.get(bucket) || { views: 0, downloads: 0, durations: [] };
      existing.views++;
      if (view.duration) existing.durations.push(view.duration);
      buckets.set(bucket, existing);
    }

    for (const download of downloads) {
      const date = new Date(download.createdAt);
      const bucket = getTimeBucket(date, aggregation).toISOString();
      const existing = buckets.get(bucket) || { views: 0, downloads: 0, durations: [] };
      existing.downloads++;
      buckets.set(bucket, existing);
    }

    const result: TimeSeriesDataPoint[] = Array.from(buckets.entries()).map(([timestamp, data]) => ({
      timestamp,
      views: data.views,
      downloads: data.downloads,
      uniqueViews: data.views, // Simplified
      avgDuration: data.durations.length > 0
        ? data.durations.reduce((a, b) => a + b, 0) / data.durations.length
        : 0,
    }));

    result.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return result.slice(-limit);
  }

  /**
   * Get analytics summary
   */
  getSummary(): AnalyticsSummary {
    const allAssets = new Set<string>();
    const totalViews = this.store['views'].size;
    const totalDownloads = this.store['downloads'].size;

    for (const view of this.store['views'].values()) {
      allAssets.add(view.assetId);
    }

    // Calculate avg duration
    let totalDuration = 0;
    let durationCount = 0;
    for (const view of this.store['views'].values()) {
      if (view.duration) {
        totalDuration += view.duration;
        durationCount++;
      }
    }

    const popularAssets = this.getPopularAssets({ limit: 10 });
    const trendingAssets = this.getTrendingAssets(10);

    // Get time series for last 30 days
    const timeSeries: TimeSeriesDataPoint[] = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const timestamp = date.toISOString();

      let dayViews = 0;
      let dayDownloads = 0;
      let dayDurations: number[] = [];

      for (const view of this.store['views'].values()) {
        const viewDate = new Date(view.createdAt);
        viewDate.setHours(0, 0, 0, 0);
        if (viewDate.toISOString() === timestamp) {
          dayViews++;
          if (view.duration) dayDurations.push(view.duration);
        }
      }

      for (const dl of this.store['downloads'].values()) {
        const dlDate = new Date(dl.createdAt);
        dlDate.setHours(0, 0, 0, 0);
        if (dlDate.toISOString() === timestamp) {
          dayDownloads++;
        }
      }

      timeSeries.push({
        timestamp,
        views: dayViews,
        downloads: dayDownloads,
        uniqueViews: dayViews,
        avgDuration: dayDurations.length > 0 ? dayDurations.reduce((a, b) => a + b, 0) / dayDurations.length : 0,
      });
    }

    const unviewedAssets = this.getUnviewedAssets(Array.from(allAssets));

    return {
      totalAssets: allAssets.size,
      totalViews,
      totalDownloads,
      avgViewDuration: durationCount > 0 ? totalDuration / durationCount : 0,
      topAssets: popularAssets,
      trendingAssets,
      unviewedAssets: unviewedAssets.length,
      timeSeries,
    };
  }

  /**
   * Get dashboard data
   */
  getDashboardData(): DashboardData {
    const summary = this.getSummary();

    // Calculate change from previous period
    const viewsChange = Math.round((Math.random() - 0.5) * 20); // Simulated
    const downloadsChange = Math.round((Math.random() - 0.5) * 20);

    // Recent activity
    const recentActivity: DashboardData['recentActivity'] = [];
    for (const view of Array.from(this.store['views'].values()).slice(-10).reverse()) {
      const info = this.assetInfoCache.get(view.assetId);
      recentActivity.push({
        assetId: view.assetId,
        assetName: info?.name || view.assetId,
        action: 'view',
        timestamp: view.createdAt,
      });
    }

    // Top categories (simplified - would need category association)
    const topCategories = [
      { category: 'Mobiliário', views: Math.round(summary.totalViews * 0.4), assets: Math.round(summary.totalAssets * 0.3) },
      { category: 'Vestuário', views: Math.round(summary.totalViews * 0.3), assets: Math.round(summary.totalAssets * 0.4) },
      { category: 'Acessórios', views: Math.round(summary.totalViews * 0.2), assets: Math.round(summary.totalAssets * 0.2) },
      { category: 'Outros', views: Math.round(summary.totalViews * 0.1), assets: Math.round(summary.totalAssets * 0.1) },
    ];

    return {
      overview: {
        totalViews: summary.totalViews,
        totalDownloads: summary.totalDownloads,
        totalAssets: summary.totalAssets,
        activeUsers: Math.round(summary.totalViews * 0.6), // Simulated
        viewsChange,
        downloadsChange,
      },
      popularAssets: summary.topAssets,
      trendingAssets: summary.trendingAssets,
      recentActivity,
      topCategories,
      timeSeries: summary.timeSeries,
    };
  }

  /**
   * Cleanup old analytics data
   */
  cleanup(retentionDays = 90): void {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    this.store.cleanupBefore(cutoff);
  }
}

/**
 * Service singleton
 */
let analyticsServiceInstance: AnalyticsService | null = null;

export function getAnalyticsService(): AnalyticsService {
  if (!analyticsServiceInstance) {
    analyticsServiceInstance = new AnalyticsService();
  }
  return analyticsServiceInstance;
}

export function createAnalyticsService(): AnalyticsService {
  return new AnalyticsService();
}
