import { describe, it, expect, beforeEach } from 'vitest';
import { TagsService } from '../src/services/tags.service.js';
import { MemoryStore } from '../src/store.js';

describe('TagsService', () => {
  let service: TagsService;
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
    service = new TagsService(store as any);
  });

  describe('Tags', () => {
    it('should create a tag', async () => {
      const tag = await service.createTag({
        name: 'Furniture',
        color: '#FF5733',
      });

      expect(tag.name).toBe('Furniture');
      expect(tag.slug).toBe('furniture');
      expect(tag.color).toBe('#FF5733');
      expect(tag.count).toBe(0);
    });

    it('should not create duplicate tags', async () => {
      await service.createTag({ name: 'Duplicate' });

      await expect(service.createTag({ name: 'Duplicate' })).rejects.toThrow();
    });

    it('should get all tags', async () => {
      await service.createTag({ name: 'Tag1' });
      await service.createTag({ name: 'Tag2' });
      await service.createTag({ name: 'Tag3' });

      const tags = await service.getTags();

      expect(tags).toHaveLength(3);
    });

    it('should search tags', async () => {
      await service.createTag({ name: 'Furniture Chair' });
      await service.createTag({ name: 'Furniture Table' });
      await service.createTag({ name: 'Lighting' });

      const results = await service.searchTags('furniture');

      expect(results).toHaveLength(2);
    });

    it('should update tag', async () => {
      const tag = await service.createTag({ name: 'Original' });

      const updated = await service.updateTag(tag.id, {
        name: 'Updated',
        color: '#00FF00',
      });

      expect(updated?.name).toBe('Updated');
      expect(updated?.slug).toBe('updated');
      expect(updated?.color).toBe('#00FF00');
    });

    it('should delete tag', async () => {
      const tag = await service.createTag({ name: 'Delete Me' });

      const deleted = await service.deleteTag(tag.id);

      expect(deleted).toBe(true);
      expect(await service.getTagById(tag.id)).toBeUndefined();
    });

    it('should add tags to asset', async () => {
      const asset = store.createAsset({
        name: 'Test Asset',
        masterUrl: 'https://example.com/test.glb',
        status: 'draft',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      });

      const tag1 = await service.createTag({ name: 'Tag1' });
      const tag2 = await service.createTag({ name: 'Tag2' });

      await service.addTagsToAsset(asset.id, [tag1.id, tag2.id]);

      const assetTags = await service.getAssetTags(asset.id);

      expect(assetTags).toHaveLength(2);
      expect(assetTags.map(t => t.name)).toContain('Tag1');
      expect(assetTags.map(t => t.name)).toContain('Tag2');
    });

    it('should update tag count when adding to asset', async () => {
      const asset = store.createAsset({
        name: 'Test Asset',
        masterUrl: 'https://example.com/test.glb',
        status: 'draft',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      });

      const tag = await service.createTag({ name: 'Popular' });

      await service.addTagsToAsset(asset.id, [tag.id]);

      const updated = await service.getTagById(tag.id);
      expect(updated?.count).toBe(1);
    });
  });

  describe('Categories', () => {
    it('should create a category', async () => {
      const category = await service.createCategory({
        name: 'Furniture',
        icon: '🪑',
      });

      expect(category.name).toBe('Furniture');
      expect(category.slug).toBe('furniture');
      expect(category.icon).toBe('🪑');
    });

    it('should create hierarchical categories', async () => {
      const parent = await service.createCategory({
        name: 'Furniture',
      });

      const child = await service.createCategory({
        name: 'Chairs',
        parentId: parent.id,
      });

      expect(child.parentId).toBe(parent.id);
    });

    it('should get category tree', async () => {
      const furniture = await service.createCategory({
        name: 'Furniture',
        order: 1,
      });

      const chairs = await service.createCategory({
        name: 'Chairs',
        parentId: furniture.id,
        order: 1,
      });

      const tables = await service.createCategory({
        name: 'Tables',
        parentId: furniture.id,
        order: 2,
      });

      const tree = await service.getCategoryTree();

      expect(tree).toHaveLength(1);
      expect(tree[0].category.name).toBe('Furniture');
      expect(tree[0].children).toHaveLength(2);
      expect(tree[0].children[0].category.name).toBe('Chairs');
      expect(tree[0].children[1].category.name).toBe('Tables');
    });

    it('should add asset to category', async () => {
      const asset = store.createAsset({
        name: 'Test Asset',
        masterUrl: 'https://example.com/test.glb',
        status: 'draft',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      });

      const category = await service.createCategory({
        name: 'Furniture',
      });

      await service.addAssetToCategory(asset.id, category.id);

      const assetCategories = await service.getAssetCategories(asset.id);

      expect(assetCategories).toHaveLength(1);
      expect(assetCategories[0].name).toBe('Furniture');
    });

    it('should not allow more than max categories per asset', async () => {
      const asset = store.createAsset({
        name: 'Test Asset',
        masterUrl: 'https://example.com/test.glb',
        status: 'draft',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      });

      const cat1 = await service.createCategory({ name: 'Cat1' });
      const cat2 = await service.createCategory({ name: 'Cat2' });
      const cat3 = await service.createCategory({ name: 'Cat3' });
      const cat4 = await service.createCategory({ name: 'Cat4' });
      const cat5 = await service.createCategory({ name: 'Cat5' });
      const cat6 = await service.createCategory({ name: 'Cat6' });

      await service.addAssetToCategory(asset.id, cat1.id);
      await service.addAssetToCategory(asset.id, cat2.id);
      await service.addAssetToCategory(asset.id, cat3.id);
      await service.addAssetToCategory(asset.id, cat4.id);
      await service.addAssetToCategory(asset.id, cat5.id);

      await expect(service.addAssetToCategory(asset.id, cat6.id)).rejects.toThrow();
    });
  });

  describe('Collections', () => {
    it('should create a collection', async () => {
      const collection = await service.createCollection({
        name: 'My Favorites',
        description: 'Favorite assets',
        userId: 'user-123',
      });

      expect(collection.name).toBe('My Favorites');
      expect(collection.slug).toBe('my-favorites');
      expect(collection.assetIds).toEqual([]);
      expect(collection.isPublic).toBe(true);
    });

    it('should add assets to collection', async () => {
      const asset1 = store.createAsset({
        name: 'Asset 1',
        masterUrl: 'https://example.com/asset1.glb',
        status: 'draft',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      });

      const asset2 = store.createAsset({
        name: 'Asset 2',
        masterUrl: 'https://example.com/asset2.glb',
        status: 'draft',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      });

      const collection = await service.createCollection({
        name: 'My Collection',
        userId: 'user-123',
      });

      await service.addAssetsToCollection(collection.id, [asset1.id, asset2.id]);

      const updated = await service.getCollectionById(collection.id);

      expect(updated?.assetIds).toHaveLength(2);
    });

    it('should get assets in collection', async () => {
      const asset = store.createAsset({
        name: 'Collection Asset',
        masterUrl: 'https://example.com/test.glb',
        status: 'draft',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      });

      const collection = await service.createCollection({
        name: 'Test Collection',
        userId: 'user-123',
      });

      await service.addAssetsToCollection(collection.id, [asset.id]);

      const assets = await service.getCollectionAssets(collection.id);

      expect(assets).toHaveLength(1);
      expect(assets[0].name).toBe('Collection Asset');
    });

    it('should remove assets from collection', async () => {
      const asset1 = store.createAsset({
        name: 'Asset 1',
        masterUrl: 'https://example.com/asset1.glb',
        status: 'draft',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      });

      const asset2 = store.createAsset({
        name: 'Asset 2',
        masterUrl: 'https://example.com/asset2.glb',
        status: 'draft',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      });

      const collection = await service.createCollection({
        name: 'Test Collection',
        userId: 'user-123',
      });

      await service.addAssetsToCollection(collection.id, [asset1.id, asset2.id]);
      await service.removeAssetsFromCollection(collection.id, [asset1.id]);

      const updated = await service.getCollectionById(collection.id);

      expect(updated?.assetIds).toHaveLength(1);
      expect(updated?.assetIds[0]).toBe(asset2.id);
    });
  });

  describe('Bulk Operations', () => {
    it('should add tags to multiple assets', async () => {
      const assets = [
        store.createAsset({
          name: 'Asset 1',
          masterUrl: 'https://example.com/asset1.glb',
          status: 'draft',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        }),
        store.createAsset({
          name: 'Asset 2',
          masterUrl: 'https://example.com/asset2.glb',
          status: 'draft',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        }),
      ];

      const tag = await service.createTag({ name: 'Bulk Tag' });

      const result = await service.bulkTagOperation({
        assetIds: assets.map(a => a.id),
        tagIds: [tag.id],
        operation: 'add',
      });

      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
    });
  });

  describe('Auto-Tagging', () => {
    it('should suggest tags based on asset name', async () => {
      const asset = store.createAsset({
        name: 'Modern Wooden Chair',
        masterUrl: 'https://example.com/chair.glb',
        status: 'draft',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      });

      const suggestions = await service.suggestTags(asset.id);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.tag === 'chair')).toBe(true);
      expect(suggestions.some(s => s.tag === 'wood')).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('should get tag statistics', async () => {
      await service.createTag({ name: 'Tag1' });
      await service.createTag({ name: 'Tag2' });
      await service.createCategory({ name: 'Cat1' });
      await service.createCollection({
        name: 'Collection 1',
        userId: 'user-123',
      });

      const stats = await service.getStats();

      expect(stats.totalTags).toBe(2);
      expect(stats.totalCategories).toBe(1);
      expect(stats.totalCollections).toBe(1);
    });
  });
});
