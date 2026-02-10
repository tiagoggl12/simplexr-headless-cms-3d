/**
 * Search Service
 * Advanced full-text search with filters and faceted search
 */

import type { PgStore } from '../store.js';
import type { Asset3D, AssetStatus } from '../models.js';

/**
 * Search filters
 */
export interface SearchFilters {
  query?: string; // Full-text search query
  status?: AssetStatus[];
  tags?: string[]; // Filter by tags
  categoryIds?: string[]; // Filter by categories
  collectionIds?: string[]; // Filter by collections
  fileSize?: {
    min?: number;
    max?: number;
  };
  dateRange?: {
    from?: string; // ISO date
    to?: string; // ISO date
  };
  format?: string[]; // glb, gltf, usdz
  hasVariants?: boolean;
  hasLods?: boolean;
  hasKtx2?: boolean;
  tenantId?: string; // For multi-tenancy
}

/**
 * Sort options
 */
export type SortField = 'name' | 'createdAt' | 'updatedAt' | 'fileSize' | 'name_asc' | 'name_desc';
export type SortOrder = 'asc' | 'desc';

export interface SortOptions {
  field?: SortField;
  order?: SortOrder;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  page?: number; // 1-based
  limit?: number; // Items per page (max 100)
}

/**
 * Search result item with highlights
 */
export interface SearchResultItem {
  asset: Asset3D;
  score?: number; // Relevance score
  highlights?: {
    name?: string;
    description?: string;
    tags?: string[];
  };
}

/**
 * Faceted search result
 */
export interface FacetedResult {
  items: SearchResultItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  facets: {
    status: Record<AssetStatus, number>;
    tags: Record<string, number>;
    categories: Array<{ id: string; name: string; count: number }>;
    formats: Record<string, number>;
    dateRange: {
      min: string;
      max: string;
    };
    fileSize: {
      min: number;
      max: number;
    };
  };
}

/**
 * Search suggestions
 */
export interface SearchSuggestion {
  type: 'asset' | 'tag' | 'category' | 'collection';
  id: string;
  title: string;
  subtitle?: string;
}

/**
 * Search service configuration
 */
export interface SearchServiceConfig {
  minQueryLength?: number;
  maxResults?: number;
  defaultLimit?: number;
  enableFuzzySearch?: boolean;
}

const DEFAULT_CONFIG: SearchServiceConfig = {
  minQueryLength: 2,
  maxResults: 100,
  defaultLimit: 20,
  enableFuzzySearch: true,
};

/**
 * Search Service
 */
export class SearchService {
  private config: SearchServiceConfig;

  constructor(
    private store: PgStore,
    config: Partial<SearchServiceConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Full-text search with filters
   */
  async search(
    filters: SearchFilters = {},
    sort: SortOptions = {},
    pagination: PaginationOptions = {}
  ): Promise<FacetedResult> {
    const page = Math.max(1, pagination.page || 1);
    const limit = Math.min(this.config.maxResults!, pagination.limit || this.config.defaultLimit!);
    const offset = (page - 1) * limit;

    console.log(`[Search] Searching with filters:`, JSON.stringify(filters));

    // Build the search query
    const whereClause = this.buildWhereClause(filters);
    const sortClause = this.buildSortClause(sort);
    const limitClause = `LIMIT ${limit} OFFSET ${offset}`;

    // For PostgreSQL with full-text search
    let query = `
      SELECT
        a.*,
        ts_rank(a.search_vector, plainto_tsquery($1)) as score
      FROM assets a
      ${whereClause}
      ${filters.query ? `AND a.search_vector @@ plainto_tsquery($1)` : ''}
      ${sortClause}
      ${limitClause}
    `;

    // For in-memory store (fallback)
    const allAssets: Asset3D[] = Array.from(this.store.getAssets());
    let filteredAssets = allAssets;

    // Apply filters
    if (filters.query) {
      const queryLower = filters.query.toLowerCase();
      filteredAssets = filteredAssets.filter(asset =>
        asset.name.toLowerCase().includes(queryLower) ||
        (asset as any).description?.toLowerCase().includes(queryLower)
      );
    }

    if (filters.status && filters.status.length > 0) {
      filteredAssets = filteredAssets.filter(asset =>
        filters.status!.includes(asset.status)
      );
    }

    if (filters.tags && filters.tags.length > 0) {
      filteredAssets = filteredAssets.filter(asset => {
        const assetTags = (asset as any).tags || [];
        return filters.tags!.some((tag: string) => assetTags.includes(tag));
      });
    }

    if (filters.format && filters.format.length > 0) {
      filteredAssets = filteredAssets.filter(asset => {
        const url = asset.masterUrl.toLowerCase();
        return filters.format!.some((fmt: string) => url.endsWith(fmt));
      });
    }

    if (filters.hasVariants !== undefined) {
      filteredAssets = filteredAssets.filter(asset => {
        const hasVariants = asset.materialVariants && asset.materialVariants.length > 0;
        return filters.hasVariants ? hasVariants : !hasVariants;
      });
    }

    if (filters.hasLods !== undefined) {
      filteredAssets = filteredAssets.filter(asset => {
        const hasLods = asset.lods && asset.lods.length > 0;
        return filters.hasLods ? hasLods : !hasLods;
      });
    }

    if (filters.hasKtx2 !== undefined) {
      filteredAssets = filteredAssets.filter(asset => {
        const hasKtx2 = asset.textureFormats?.some(f => f.format === 'ktx2');
        return filters.hasKtx2 ? hasKtx2 : !hasKtx2;
      });
    }

    // Apply sorting
    filteredAssets = this.sortAssets(filteredAssets, sort);

    // Calculate pagination
    const total = filteredAssets.length;
    const totalPages = Math.ceil(total / limit);
    const paginatedAssets = filteredAssets.slice(offset, offset + limit);

    // Build result items
    const items: SearchResultItem[] = paginatedAssets.map(asset => ({
      asset,
      score: filters.query ? this.calculateScore(asset, filters.query!) : undefined,
      highlights: filters.query ? this.getHighlights(asset, filters.query!) : undefined,
    }));

    // Calculate facets
    const facets = this.calculateFacets(allAssets, filters);

    return {
      items,
      total,
      page,
      limit,
      totalPages,
      facets,
    };
  }

  /**
   * Build WHERE clause for SQL query
   */
  private buildWhereClause(filters: SearchFilters): string {
    const conditions: string[] = [];

    if (filters.status && filters.status.length > 0) {
      conditions.push(`status IN (${filters.status.map(s => `'${s}'`).join(', ')})`);
    }

    if (filters.tenantId) {
      conditions.push(`tenant_id = '${filters.tenantId}'`);
    }

    if (filters.categoryIds && filters.categoryIds.length > 0) {
      // Would require JOIN with categories table
      // For now, skip
    }

    return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  }

  /**
   * Build ORDER BY clause for SQL query
   */
  private buildSortClause(sort: SortOptions): string {
    const field = sort.field || 'createdAt';
    const order = sort.order || 'desc';

    if (field === 'name_asc') {
      return 'ORDER BY name ASC';
    } else if (field === 'name_desc') {
      return 'ORDER BY name DESC';
    }

    const columnMap: Record<string, string> = {
      name: 'name',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      fileSize: 'file_size',
    };

    const column = columnMap[field] || 'created_at';
    return `ORDER BY ${column} ${order.toUpperCase()}`;
  }

  /**
   * Sort assets in memory
   */
  private sortAssets(assets: Asset3D[], sort: SortOptions): Asset3D[] {
    const field = sort.field || 'createdAt';
    const order = sort.order || 'desc';

    return [...assets].sort((a, b) => {
      let comparison = 0;

      switch (field) {
        case 'name':
        case 'name_asc':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'name_desc':
          comparison = b.name.localeCompare(a.name);
          break;
        case 'createdAt':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'updatedAt':
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        case 'fileSize':
          // Would need actual file size from storage
          comparison = 0;
          break;
        default:
          comparison = 0;
      }

      return order === 'desc' ? -comparison : comparison;
    });
  }

  /**
   * Calculate relevance score for an asset
   */
  private calculateScore(asset: Asset3D, query: string): number {
    const queryLower = query.toLowerCase();
    let score = 0;

    // Exact name match
    if (asset.name.toLowerCase() === queryLower) {
      score += 100;
    }
    // Name starts with query
    else if (asset.name.toLowerCase().startsWith(queryLower)) {
      score += 50;
    }
    // Name contains query
    else if (asset.name.toLowerCase().includes(queryLower)) {
      score += 25;
    }

    // Description match
    const description = (asset as any).description || '';
    if (description.toLowerCase().includes(queryLower)) {
      score += 10;
    }

    // Tag match
    const tags = (asset as any).tags || [];
    for (const tag of tags) {
      if (tag.toLowerCase().includes(queryLower)) {
        score += 15;
      }
    }

    return score;
  }

  /**
   * Get highlights for search results
   */
  private getHighlights(asset: Asset3D, query: string): {
    name?: string;
    description?: string;
    tags?: string[];
  } {
    const highlights: any = {};
    const queryLower = query.toLowerCase();

    // Highlight in name
    const nameLower = asset.name.toLowerCase();
    if (nameLower.includes(queryLower)) {
      const start = nameLower.indexOf(queryLower);
      const end = start + query.length;
      highlights.name = asset.name.slice(0, start) +
        '__HL__' + asset.name.slice(start, end) + '__HL__' +
        asset.name.slice(end);
    }

    return highlights;
  }

  /**
   * Calculate facet counts
   */
  private calculateFacets(assets: Asset3D[], filters: SearchFilters) {
    const facets: FacetedResult['facets'] = {
      status: {} as Record<AssetStatus, number>,
      tags: {} as Record<string, number>,
      categories: [],
      formats: {} as Record<string, number>,
      dateRange: {
        min: assets.length > 0 ? assets[0].createdAt : new Date().toISOString(),
        max: assets.length > 0 ? assets[0].createdAt : new Date().toISOString(),
      },
      fileSize: {
        min: 0,
        max: 0,
      },
    };

    // Count by status
    for (const asset of assets) {
      facets.status[asset.status] = (facets.status[asset.status] || 0) + 1;

      // Count by format
      const format = asset.masterUrl.split('.').pop()?.toLowerCase() || 'unknown';
      facets.formats[format] = (facets.formats[format] || 0) + 1;

      // Count tags
      const tags = (asset as any).tags || [];
      for (const tag of tags) {
        facets.tags[tag] = (facets.tags[tag] || 0) + 1;
      }
    }

    // Date range
    const dates = assets.map(a => new Date(a.createdAt).getTime());
    if (dates.length > 0) {
      facets.dateRange = {
        min: new Date(Math.min(...dates)).toISOString(),
        max: new Date(Math.max(...dates)).toISOString(),
      };
    }

    return facets;
  }

  /**
   * Get search suggestions as user types
   */
  async getSuggestions(
    query: string,
    limit: number = 5
  ): Promise<SearchSuggestion[]> {
    if (query.length < this.config.minQueryLength!) {
      return [];
    }

    const queryLower = query.toLowerCase();
    const suggestions: SearchSuggestion[] = [];

    const allAssets: Asset3D[] = Array.from(this.store.getAssets());

    // Asset name suggestions
    for (const asset of allAssets) {
      if (asset.name.toLowerCase().startsWith(queryLower)) {
        suggestions.push({
          type: 'asset',
          id: asset.id,
          title: asset.name,
          subtitle: 'Asset',
        });
      }
      if (suggestions.length >= limit) break;
    }

    return suggestions.slice(0, limit);
  }

  /**
   * Similar assets search (by name, tags, etc.)
   */
  async findSimilar(
    assetId: string,
    limit: number = 5
  ): Promise<Asset3D[]> {
    const asset = this.store.getAsset(assetId);
    if (!asset) {
      return [];
    }

    const allAssets: Asset3D[] = Array.from(this.store.getAssets())
      .filter((a: Asset3D) => a.id !== assetId);

    const similarities = allAssets.map(a => ({
      asset: a,
      score: this.calculateSimilarity(asset, a),
    }));

    similarities.sort((a, b) => b.score - a.score);

    return similarities.slice(0, limit).map(s => s.asset);
  }

  /**
   * Calculate similarity between two assets
   */
  private calculateSimilarity(asset1: Asset3D, asset2: Asset3D): number {
    let score = 0;

    // Same status
    if (asset1.status === asset2.status) score += 10;

    // Name similarity
    const words1 = asset1.name.toLowerCase().split(/\s+/);
    const words2 = asset2.name.toLowerCase().split(/\s+/);
    const commonWords = words1.filter((w: string) => words2.includes(w));
    score += commonWords.length * 5;

    // Tag overlap
    const tags1 = (asset1 as any).tags || [];
    const tags2 = (asset2 as any).tags || [];
    const commonTags = tags1.filter((t: string) => tags2.includes(t));
    score += commonTags.length * 8;

    return score;
  }

  /**
   * Advanced spatial search (by bounding box dimensions)
   */
  async spatialSearch(params: {
    minHeight?: number;
    maxHeight?: number;
    minWidth?: number;
    maxWidth?: number;
    minDepth?: number;
    maxDepth?: number;
  }): Promise<Asset3D[]> {
    const allAssets: Asset3D[] = Array.from(this.store.getAssets());

    return allAssets.filter(asset => {
      const bbox = (asset as any).boundingBox;
      if (!bbox) return false;

      if (params.minHeight && bbox.height < params.minHeight) return false;
      if (params.maxHeight && bbox.height > params.maxHeight) return false;
      if (params.minWidth && bbox.width < params.minWidth) return false;
      if (params.maxWidth && bbox.width > params.maxWidth) return false;
      if (params.minDepth && bbox.depth < params.minDepth) return false;
      if (params.maxDepth && bbox.depth > params.maxDepth) return false;

      return true;
    });
  }

  /**
   * Recent assets
   */
  async getRecent(limit: number = 10): Promise<Asset3D[]> {
    const allAssets: Asset3D[] = Array.from(this.store.getAssets());

    return allAssets
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  /**
   * Popular assets (by views/usage)
   */
  async getPopular(limit: number = 10): Promise<Asset3D[]> {
    const allAssets: Asset3D[] = Array.from(this.store.getAssets());

    // Sort by view count if available
    return allAssets
      .sort((a, b) => ((b as any).viewCount || 0) - ((a as any).viewCount || 0))
      .slice(0, limit);
  }
}

/**
 * Create search service instance
 */
export function createSearchService(store: PgStore, config?: Partial<SearchServiceConfig>): SearchService {
  return new SearchService(store, config);
}

/**
 * Singleton instance
 */
let searchServiceInstance: SearchService | null = null;

export function getSearchService(): SearchService {
  if (!searchServiceInstance) {
    // Will need to inject store
    throw new Error('SearchService not initialized. Call createSearchService first.');
  }
  return searchServiceInstance;
}
