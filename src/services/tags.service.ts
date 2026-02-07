/**
 * Tags Service
 * Manages tags, categories, and collections for asset organization
 */

import type { PgStore } from '../store.js';
import type {
  Tag,
  Category,
  Collection,
  AssetTag,
  AssetCategory,
  BulkTagOperation,
  CategoryTreeNode,
  TagStats,
  TagSuggestion,
} from '../models/tags.js';
import type { Asset3D } from '../models.js';

/**
 * Tags Service Configuration
 */
export interface TagsServiceConfig {
  maxTagsPerAsset?: number;
  maxCategoriesPerAsset?: number;
  enableAutoTagging?: boolean;
}

const DEFAULT_CONFIG: TagsServiceConfig = {
  maxTagsPerAsset: 20,
  maxCategoriesPerAsset: 5,
  enableAutoTagging: false,
};

/**
 * Tags Service
 */
export class TagsService {
  private config: TagsServiceConfig;

  // In-memory storage (replace with PostgreSQL in production)
  private tags = new Map<string, Tag>();
  private tagsBySlug = new Map<string, Tag>();
  private categories = new Map<string, Category>();
  private categoriesBySlug = new Map<string, Category>();
  private collections = new Map<string, Collection>();
  private assetTags = new Map<string, Set<string>>(); // assetId -> tagIds
  private assetCategories = new Map<string, Set<string>>(); // assetId -> categoryIds

  constructor(
    private store: PgStore,
    config: Partial<TagsServiceConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==================== TAGS ====================

  /**
   * Create a new tag
   */
  async createTag(data: {
    name: string;
    color?: string;
    description?: string;
    parentId?: string;
    tenantId?: string;
  }): Promise<Tag> {
    const slug = this.generateSlug(data.name);

    // Check if slug already exists
    if (this.tagsBySlug.has(slug)) {
      throw new Error(`Tag with slug "${slug}" already exists`);
    }

    const now = new Date().toISOString();
    const tag: Tag = {
      id: `tag_${randomBytes(16).toString('hex')}`,
      name: data.name,
      slug,
      color: data.color,
      description: data.description,
      parentId: data.parentId,
      count: 0,
      createdAt: now,
      updatedAt: now,
      tenantId: data.tenantId,
    };

    this.tags.set(tag.id, tag);
    this.tagsBySlug.set(slug, tag);

    console.log(`[Tags] Created tag: ${tag.name} (${tag.id})`);
    return tag;
  }

  /**
   * Get all tags
   */
  async getTags(tenantId?: string): Promise<Tag[]> {
    const allTags = Array.from(this.tags.values());

    if (tenantId) {
      return allTags.filter(t => t.tenantId === tenantId);
    }

    return allTags;
  }

  /**
   * Get tag by ID
   */
  async getTagById(id: string): Promise<Tag | undefined> {
    return this.tags.get(id);
  }

  /**
   * Get tag by slug
   */
  async getTagBySlug(slug: string): Promise<Tag | undefined> {
    return this.tagsBySlug.get(slug);
  }

  /**
   * Update tag
   */
  async updateTag(id: string, updates: Partial<Omit<Tag, 'id' | 'createdAt'>>): Promise<Tag | undefined> {
    const tag = this.tags.get(id);
    if (!tag) return undefined;

    const updated: Tag = {
      ...tag,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Update slug if name changed
    if (updates.name && updates.name !== tag.name) {
      this.tagsBySlug.delete(tag.slug);
      updated.slug = this.generateSlug(updates.name);
      this.tagsBySlug.set(updated.slug, updated);
    }

    this.tags.set(id, updated);
    return updated;
  }

  /**
   * Delete tag
   */
  async deleteTag(id: string): Promise<boolean> {
    const tag = this.tags.get(id);
    if (!tag) return false;

    // Remove from all assets
    for (const [assetId, tagIds] of this.assetTags.entries()) {
      tagIds.delete(id);
      if (tagIds.size === 0) {
        this.assetTags.delete(assetId);
      }
    }

    this.tags.delete(id);
    this.tagsBySlug.delete(tag.slug);
    return true;
  }

  /**
   * Get tags for an asset
   */
  async getAssetTags(assetId: string): Promise<Tag[]> {
    const tagIds = this.assetTags.get(assetId);
    if (!tagIds) return [];

    const tags: Tag[] = [];
    for (const tagId of tagIds) {
      const tag = this.tags.get(tagId);
      if (tag) {
        tags.push(tag);
      }
    }

    return tags;
  }

  /**
   * Add tags to an asset
   */
  async addTagsToAsset(assetId: string, tagIds: string[]): Promise<void> {
    let tagSet = this.assetTags.get(assetId);
    if (!tagSet) {
      tagSet = new Set<string>();
      this.assetTags.set(assetId, tagSet);
    }

    const asset = this.store.getAsset(assetId);
    if (!asset) {
      throw new Error(`Asset not found: ${assetId}`);
    }

    for (const tagId of tagIds) {
      const tag = this.tags.get(tagId);
      if (!tag) {
        console.warn(`[Tags] Tag not found: ${tagId}`);
        continue;
      }

      if (!tagSet.has(tagId)) {
        tagSet.add(tagId);
        // Update tag count
        tag.count++;
        this.tags.set(tagId, tag);
      }
    }

    console.log(`[Tags] Added ${tagIds.length} tags to asset ${assetId}`);
  }

  /**
   * Remove tags from an asset
   */
  async removeTagsFromAsset(assetId: string, tagIds: string[]): Promise<void> {
    const tagSet = this.assetTags.get(assetId);
    if (!tagSet) return;

    for (const tagId of tagIds) {
      if (tagSet.delete(tagId)) {
        const tag = this.tags.get(tagId);
        if (tag) {
          tag.count--;
          this.tags.set(tagId, tag);
        }
      }
    }

    if (tagSet.size === 0) {
      this.assetTags.delete(assetId);
    }

    console.log(`[Tags] Removed ${tagIds.length} tags from asset ${assetId}`);
  }

  /**
   * Set tags for an asset (replace all)
   */
  async setAssetTags(assetId: string, tagIds: string[]): Promise<void> {
    // Remove existing tags
    const existingTagIds = this.assetTags.get(assetId);
    if (existingTagIds) {
      await this.removeTagsFromAsset(assetId, Array.from(existingTagIds));
    }

    // Add new tags
    if (tagIds.length > 0) {
      await this.addTagsToAsset(assetId, tagIds);
    }
  }

  /**
   * Search tags by name
   */
  async searchTags(query: string, limit: number = 10): Promise<Tag[]> {
    const queryLower = query.toLowerCase();
    const allTags = Array.from(this.tags.values());

    return allTags
      .filter(t => t.name.toLowerCase().includes(queryLower))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  // ==================== CATEGORIES ====================

  /**
   * Create a category
   */
  async createCategory(data: {
    name: string;
    description?: string;
    icon?: string;
    parentId?: string;
    order?: number;
    tenantId?: string;
  }): Promise<Category> {
    const slug = this.generateSlug(data.name);

    if (this.categoriesBySlug.has(slug)) {
      throw new Error(`Category with slug "${slug}" already exists`);
    }

    const now = new Date().toISOString();
    const category: Category = {
      id: `cat_${randomBytes(16).toString('hex')}`,
      name: data.name,
      slug,
      description: data.description,
      icon: data.icon,
      parentId: data.parentId,
      order: data.order ?? 0,
      count: 0,
      createdAt: now,
      updatedAt: now,
      tenantId: data.tenantId,
    };

    this.categories.set(category.id, category);
    this.categoriesBySlug.set(slug, category);

    console.log(`[Tags] Created category: ${category.name} (${category.id})`);
    return category;
  }

  /**
   * Get all categories
   */
  async getCategories(tenantId?: string): Promise<Category[]> {
    const allCategories = Array.from(this.categories.values());

    if (tenantId) {
      return allCategories.filter(c => c.tenantId === tenantId);
    }

    return allCategories.sort((a, b) => a.order - b.order);
  }

  /**
   * Get category tree
   */
  async getCategoryTree(tenantId?: string): Promise<CategoryTreeNode[]> {
    const categories = await this.getCategories(tenantId);
    const rootCategories = categories.filter(c => !c.parentId);

    return this.buildCategoryTree(rootCategories, categories, 0);
  }

  /**
   * Recursively build category tree
   */
  private buildCategoryTree(
    categories: Category[],
    allCategories: Category[],
    depth: number
  ): CategoryTreeNode[] {
    return categories.map(category => ({
      category,
      children: this.buildCategoryTree(
        allCategories.filter(c => c.parentId === category.id),
        allCategories,
        depth + 1
      ),
      depth,
    }));
  }

  /**
   * Update category
   */
  async updateCategory(id: string, updates: Partial<Omit<Category, 'id' | 'createdAt'>>): Promise<Category | undefined> {
    const category = this.categories.get(id);
    if (!category) return undefined;

    const updated: Category = {
      ...category,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    if (updates.name && updates.name !== category.name) {
      this.categoriesBySlug.delete(category.slug);
      updated.slug = this.generateSlug(updates.name);
      this.categoriesBySlug.set(updated.slug, updated);
    }

    this.categories.set(id, updated);
    return updated;
  }

  /**
   * Delete category
   */
  async deleteCategory(id: string): Promise<boolean> {
    const category = this.categories.get(id);
    if (!category) return false;

    // Check if has children
    const hasChildren = Array.from(this.categories.values()).some(c => c.parentId === id);
    if (hasChildren) {
      throw new Error('Cannot delete category with subcategories. Move or delete them first.');
    }

    // Remove from all assets
    for (const [assetId, categoryIds] of this.assetCategories.entries()) {
      categoryIds.delete(id);
      if (categoryIds.size === 0) {
        this.assetCategories.delete(assetId);
      }
    }

    this.categories.delete(id);
    this.categoriesBySlug.delete(category.slug);
    return true;
  }

  /**
   * Get categories for an asset
   */
  async getAssetCategories(assetId: string): Promise<Category[]> {
    const categoryIds = this.assetCategories.get(assetId);
    if (!categoryIds) return [];

    const categories: Category[] = [];
    for (const categoryId of categoryIds) {
      const category = this.categories.get(categoryId);
      if (category) {
        categories.push(category);
      }
    }

    return categories;
  }

  /**
   * Add asset to category
   */
  async addAssetToCategory(assetId: string, categoryId: string): Promise<void> {
    let categorySet = this.assetCategories.get(assetId);
    if (!categorySet) {
      categorySet = new Set<string>();
      this.assetCategories.set(assetId, categorySet);
    }

    const category = this.categories.get(categoryId);
    if (!category) {
      throw new Error(`Category not found: ${categoryId}`);
    }

    // Check max categories limit
    if (categorySet.size >= this.config.maxCategoriesPerAsset!) {
      throw new Error(`Maximum ${this.config.maxCategoriesPerAsset} categories per asset`);
    }

    categorySet.add(categoryId);
    category.count++;
    this.categories.set(categoryId, category);

    console.log(`[Tags] Added asset ${assetId} to category ${category.name}`);
  }

  /**
   * Remove asset from category
   */
  async removeAssetFromCategory(assetId: string, categoryId: string): Promise<void> {
    const categorySet = this.assetCategories.get(assetId);
    if (!categorySet) return;

    if (categorySet.delete(categoryId)) {
      const category = this.categories.get(categoryId);
      if (category) {
        category.count--;
        this.categories.set(categoryId, category);
      }
    }

    if (categorySet.size === 0) {
      this.assetCategories.delete(assetId);
    }
  }

  // ==================== COLLECTIONS ====================

  /**
   * Create a collection
   */
  async createCollection(data: {
    name: string;
    description?: string;
    coverAssetId?: string;
    isPublic?: boolean;
    userId: string;
    tenantId?: string;
  }): Promise<Collection> {
    const slug = this.generateSlug(data.name);

    const now = new Date().toISOString();
    const collection: Collection = {
      id: `col_${randomBytes(16).toString('hex')}`,
      name: data.name,
      slug,
      description: data.description,
      coverAssetId: data.coverAssetId,
      isPublic: data.isPublic ?? true,
      order: 0,
      assetIds: [],
      userId: data.userId,
      createdAt: now,
      updatedAt: now,
      tenantId: data.tenantId,
    };

    this.collections.set(collection.id, collection);

    console.log(`[Tags] Created collection: ${collection.name} (${collection.id})`);
    return collection;
  }

  /**
   * Get all collections
   */
  async getCollections(userId?: string, tenantId?: string): Promise<Collection[]> {
    const allCollections = Array.from(this.collections.values());

    let filtered = allCollections;

    if (userId) {
      filtered = filtered.filter(c => c.userId === userId || c.isPublic);
    }

    if (tenantId) {
      filtered = filtered.filter(c => c.tenantId === tenantId);
    }

    return filtered.sort((a, b) => a.order - b.order);
  }

  /**
   * Get collection by ID
   */
  async getCollectionById(id: string): Promise<Collection | undefined> {
    return this.collections.get(id);
  }

  /**
   * Update collection
   */
  async updateCollection(id: string, updates: Partial<Omit<Collection, 'id' | 'createdAt'>>): Promise<Collection | undefined> {
    const collection = this.collections.get(id);
    if (!collection) return undefined;

    const updated: Collection = {
      ...collection,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.collections.set(id, updated);
    return updated;
  }

  /**
   * Delete collection
   */
  async deleteCollection(id: string): Promise<boolean> {
    return this.collections.delete(id);
  }

  /**
   * Add assets to collection
   */
  async addAssetsToCollection(collectionId: string, assetIds: string[]): Promise<void> {
    const collection = this.collections.get(collectionId);
    if (!collection) {
      throw new Error(`Collection not found: ${collectionId}`);
    }

    for (const assetId of assetIds) {
      if (!collection.assetIds.includes(assetId)) {
        collection.assetIds.push(assetId);
      }
    }

    collection.updatedAt = new Date().toISOString();
    this.collections.set(collectionId, collection);

    console.log(`[Tags] Added ${assetIds.length} assets to collection ${collection.name}`);
  }

  /**
   * Remove assets from collection
   */
  async removeAssetsFromCollection(collectionId: string, assetIds: string[]): Promise<void> {
    const collection = this.collections.get(collectionId);
    if (!collection) return;

    collection.assetIds = collection.assetIds.filter(id => !assetIds.includes(id));
    collection.updatedAt = new Date().toISOString();
    this.collections.set(collectionId, collection);
  }

  /**
   * Get assets in collection
   */
  async getCollectionAssets(collectionId: string): Promise<Asset3D[]> {
    const collection = this.collections.get(collectionId);
    if (!collection) return [];

    const assets: Asset3D[] = [];
    for (const assetId of collection.assetIds) {
      const asset = this.store.getAsset(assetId);
      if (asset) {
        assets.push(asset);
      }
    }

    return assets;
  }

  // ==================== BULK OPERATIONS ====================

  /**
   * Perform bulk tag operation
   */
  async bulkTagOperation(operation: BulkTagOperation): Promise<{
    success: number;
    failed: number;
    errors: Array<{ assetId: string; error: string }>;
  }> {
    let success = 0;
    let failed = 0;
    const errors: Array<{ assetId: string; error: string }> = [];

    for (const assetId of operation.assetIds) {
      try {
        const existingTags = this.assetTags.get(assetId) || new Set();

        switch (operation.operation) {
          case 'add':
            await this.addTagsToAsset(assetId, operation.tagIds);
            break;
          case 'remove':
            await this.removeTagsFromAsset(assetId, operation.tagIds);
            break;
          case 'replace':
            await this.setAssetTags(assetId, operation.tagIds);
            break;
        }

        success++;
      } catch (error: any) {
        failed++;
        errors.push({ assetId, error: error.message });
      }
    }

    console.log(`[Tags] Bulk operation complete: ${success} success, ${failed} failed`);
    return { success, failed, errors };
  }

  // ==================== AUTO-TAGGING ====================

  /**
   * Suggest tags for an asset based on AI
   */
  async suggestTags(assetId: string): Promise<TagSuggestion[]> {
    const asset = this.store.getAsset(assetId);
    if (!asset) {
      throw new Error(`Asset not found: ${assetId}`);
    }

    // For now, return basic suggestions based on asset name
    const suggestions: TagSuggestion[] = [];
    const nameLower = asset.name.toLowerCase();

    // Common furniture/household terms
    const commonTerms = [
      'chair', 'table', 'sofa', 'bed', 'desk', 'shelf', 'lamp',
      'couch', 'armchair', 'stool', 'bench', 'cabinet', 'wardrobe',
      'modern', 'vintage', 'wood', 'metal', 'plastic', 'glass',
      'outdoor', 'indoor', 'office', 'living', 'bedroom'
    ];

    for (const term of commonTerms) {
      if (nameLower.includes(term)) {
        suggestions.push({
          tag: term,
          confidence: 0.8,
          source: 'text',
        });
      }
    }

    // TODO: Integrate with vision AI for image-based suggestions
    return suggestions.slice(0, 5);
  }

  // ==================== STATS ====================

  /**
   * Get tags statistics
   */
  async getStats(): Promise<TagStats> {
    const allTags = Array.from(this.tags.values());
    const allCategories = Array.from(this.categories.values());
    const allCollections = Array.from(this.collections.values());

    // Most used tags
    const mostUsedTags = allTags
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(tag => ({ tag, count: tag.count }));

    // Category counts
    const categoryCounts = allCategories
      .sort((a, b) => b.count - a.count)
      .map(category => ({ category, count: category.count }));

    return {
      totalTags: allTags.length,
      totalCategories: allCategories.length,
      totalCollections: allCollections.length,
      mostUsedTags,
      categoryCounts,
    };
  }

  // ==================== UTILITIES ====================

  /**
   * Generate URL-friendly slug from name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
      .replace(/\s+/g, '-') // Spaces to hyphens
      .replace(/-+/g, '-') // Multiple hyphens to single
      .trim();
  }
}

/**
 * Create tags service instance
 */
export function createTagsService(store: PgStore, config?: Partial<TagsServiceConfig>): TagsService {
  return new TagsService(store, config);
}

/**
 * Singleton instance
 */
let tagsServiceInstance: TagsService | null = null;

export function getTagsService(): TagsService {
  if (!tagsServiceInstance) {
    throw new Error('TagsService not initialized. Call createTagsService first.');
  }
  return tagsServiceInstance;
}

// Helper for randomBytes
import { randomBytes as _randomBytes } from 'node:crypto';
const randomBytes = (size: number) => _randomBytes(size);
