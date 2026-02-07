/**
 * Tags and Categories Models
 * Asset organization and classification system
 */

/**
 * Tag for labeling assets
 */
export interface Tag {
  id: string;
  name: string;
  slug: string; // URL-friendly identifier
  color?: string; // Hex color for UI
  description?: string;
  parentId?: string; // For hierarchical tags
  count: number; // Number of assets with this tag
  createdAt: string;
  updatedAt: string;
  tenantId?: string;
}

/**
 * Category for organizing assets
 */
export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string; // Icon identifier or emoji
  parentId?: string; // For hierarchical categories
  order: number; // Display order
  count: number; // Number of assets in this category
  createdAt: string;
  updatedAt: string;
  tenantId?: string;
}

/**
 * Collection for grouping assets
 */
export interface Collection {
  id: string;
  name: string;
  slug: string;
  description?: string;
  coverAssetId?: string; // Asset to use as cover image
  isPublic: boolean;
  order: number;
  assetIds: string[]; // Asset IDs in this collection
  userId: string; // Owner
  createdAt: string;
  updatedAt: string;
  tenantId?: string;
}

/**
 * Asset tag association (many-to-many)
 */
export interface AssetTag {
  assetId: string;
  tagId: string;
  createdAt: string;
}

/**
 * Asset category association (many-to-many)
 */
export interface AssetCategory {
  assetId: string;
  categoryId: string;
  order: number; // Order within category
}

/**
 * Tag suggestion from AI
 */
export interface TagSuggestion {
  tag: string;
  confidence: number; // 0-1
  source: 'vision' | 'text' | 'manual';
}

/**
 * Bulk tag operations
 */
export interface BulkTagOperation {
  assetIds: string[];
  tagIds: string[];
  operation: 'add' | 'remove' | 'replace';
}

/**
 * Category tree node
 */
export interface CategoryTreeNode {
  category: Category;
  children: CategoryTreeNode[];
  depth: number;
}

/**
 * Tag stats
 */
export interface TagStats {
  totalTags: number;
  totalCategories: number;
  totalCollections: number;
  mostUsedTags: Array<{ tag: Tag; count: number }>;
  categoryCounts: Array<{ category: Category; count: number }>;
}
