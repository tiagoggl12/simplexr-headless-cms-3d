/**
 * Asset Analytics Models
 * Tracks views, downloads, and engagement metrics for 3D assets
 */

/**
 * Asset interaction event types
 */
export type AnalyticsEventType = 'view' | 'download' | 'share' | 'embed' | 'render';

/**
 * Time aggregation for analytics
 */
export type TimeAggregation = 'hour' | 'day' | 'week' | 'month' | 'year';

/**
 * Asset view event
 */
export interface AssetView {
  id: string;
  assetId: string;
  userId?: string; // null for anonymous views
  sessionId?: string; // For session tracking
  duration?: number; // View duration in milliseconds
  referrer?: string;
  userAgent?: string;
  ipAddress?: string; // Hashed for privacy
  context?: {
    device?: 'desktop' | 'mobile' | 'tablet';
    browser?: string;
    os?: string;
    country?: string;
  };
  createdAt: string;
}

/**
 * Aggregate metrics for a single asset
 */
export interface AssetMetrics {
  assetId: string;
  views: number;
  uniqueViews: number; // Count of unique users/sessions
  downloads: number;
  shares: number;
  embeds: number;
  avgViewDuration: number; // milliseconds
  lastViewedAt?: string;
  lastDownloadedAt?: string;
  popularWith: string[]; // User IDs who viewed this asset
  relatedAssets: string[]; // IDs of assets also viewed by users who viewed this
}

/**
 * Time series data point
 */
export interface TimeSeriesDataPoint {
  timestamp: string;
  views: number;
  downloads: number;
  uniqueViews: number;
  avgDuration: number;
}

/**
 * Popular/trending asset
 */
export interface PopularAsset {
  assetId: string;
  assetName: string;
  views: number;
  downloads: number;
  trend: 'up' | 'down' | 'stable';
  trendPercentage: number; // Change percentage
  thumbnailUrl?: string;
}

/**
 * Analytics summary for dashboard
 */
export interface AnalyticsSummary {
  totalAssets: number;
  totalViews: number;
  totalDownloads: number;
  avgViewDuration: number;
  topAssets: PopularAsset[];
  trendingAssets: PopularAsset[];
  unviewedAssets: number;
  timeSeries: TimeSeriesDataPoint[];
}

/**
 * User engagement score
 */
export interface UserEngagement {
  userId: string;
  totalViews: number;
  totalDownloads: number;
  avgSessionDuration: number;
  favoriteCategories: string[];
  lastActivityAt: string;
  engagementScore: number; // 0-100
}

/**
 * Analytics query filters
 */
export interface AnalyticsQuery {
  assetId?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  aggregation?: TimeAggregation;
  includeAnonymous?: boolean;
}

/**
 * Popular assets query options
 */
export interface PopularAssetsQuery {
  limit?: number;
  offset?: number;
  timeRange?: 'day' | 'week' | 'month' | 'year' | 'all';
  sortBy?: 'views' | 'downloads' | 'trending';
  category?: string;
}

/**
 * Create view event request
 */
export interface TrackViewRequest {
  sessionId?: string;
  duration?: number;
  referrer?: string;
  userAgent?: string;
  context?: {
    device?: 'desktop' | 'mobile' | 'tablet';
    browser?: string;
    os?: string;
    country?: string;
  };
}

/**
 * Create download event request
 */
export interface TrackDownloadRequest {
  format?: string; // Downloaded format
  userId?: string;
}

/**
 * Share event request
 */
export interface TrackShareRequest {
  platform: 'email' | 'twitter' | 'facebook' | 'link' | 'embed' | 'other';
  userId?: string;
}

/**
 * Analytics dashboard data
 */
export interface DashboardData {
  overview: {
    totalViews: number;
    totalDownloads: number;
    totalAssets: number;
    activeUsers: number;
    viewsChange: number; // percentage change from previous period
    downloadsChange: number;
  };
  popularAssets: PopularAsset[];
  trendingAssets: PopularAsset[];
  recentActivity: {
    assetId: string;
    assetName: string;
    action: AnalyticsEventType;
    timestamp: string;
  }[];
  topCategories: {
    category: string;
    views: number;
    assets: number;
  }[];
  timeSeries: TimeSeriesDataPoint[];
}

/**
 * Privacy helper - hash IP for storage
 */
export function hashIP(ip: string): string {
  // Simple hash for demonstration - use proper hashing in production
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `h${Math.abs(hash).toString(16)}`;
}

/**
 * Calculate engagement score (0-100)
 */
export function calculateEngagementScore(
  views: number,
  avgDuration: number,
  downloads: number,
  shares: number
): number {
  // Weighted calculation
  const viewScore = Math.min(views / 100, 1) * 30;
  const durationScore = Math.min(avgDuration / 60000, 1) * 25; // Up to 1 minute
  const downloadScore = Math.min(downloads / 10, 1) * 30;
  const shareScore = Math.min(shares / 5, 1) * 15;

  return Math.round(viewScore + durationScore + downloadScore + shareScore);
}

/**
 * Determine trend direction
 */
export function calculateTrend(
  current: number,
  previous: number
): 'up' | 'down' | 'stable' {
  if (previous === 0) return 'stable';
  const change = ((current - previous) / previous) * 100;
  if (change > 5) return 'up';
  if (change < -5) return 'down';
  return 'stable';
}

/**
 * Format duration for display
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Get time bucket for aggregation
 */
export function getTimeBucket(date: Date, aggregation: TimeAggregation): Date {
  const d = new Date(date);

  switch (aggregation) {
    case 'hour':
      d.setMinutes(0, 0, 0);
      break;
    case 'day':
      d.setHours(0, 0, 0, 0);
      break;
    case 'week':
      const day = d.getDay();
      d.setDate(d.getDate() - day);
      d.setHours(0, 0, 0, 0);
      break;
    case 'month':
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      break;
    case 'year':
      d.setMonth(0, 1);
      d.setHours(0, 0, 0, 0);
      break;
  }

  return d;
}
