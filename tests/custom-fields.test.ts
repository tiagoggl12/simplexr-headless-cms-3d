/**
 * Custom Fields Service Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createCustomFieldsService } from '../src/services/custom-fields.service.js';
import type { CreateAssetTypeRequest } from '../src/models/custom-fields.js';

describe('CustomFieldsService', () => {
  let service: ReturnType<typeof createCustomFieldsService>;

  beforeEach(() => {
    service = createCustomFieldsService();
  });

  describe('Default Asset Types', () => {
    it('should create default asset types on initialization', () => {
      const types = service.listAssetTypes();
      expect(types.length).toBeGreaterThanOrEqual(3);

      const slugs = types.map(t => t.slug);
      expect(slugs).toContain('mobiliario');
      expect(slugs).toContain('vestuario');
      expect(slugs).toContain('acessorios');
    });

    it('should have mobiliario with correct fields', () => {
      const mobiliario = service.getAssetTypeBySlug('mobiliario');
      expect(mobiliario).toBeDefined();
      expect(mobiliario?.fields).toHaveLength(5);

      const materialField = mobiliario?.fields.find(f => f.slug === 'material');
      expect(materialField?.type).toBe('select');
      expect(materialField?.options).toContain('Madeira');
      expect(materialField?.options).toContain('Metal');
    });

    it('should have vestuario with size field', () => {
      const vestuario = service.getAssetTypeBySlug('vestuario');
      expect(vestuario).toBeDefined();

      const sizeField = vestuario?.fields.find(f => f.slug === 'tamanho');
      expect(sizeField?.type).toBe('select');
      expect(sizeField?.options).toContain('PP');
      expect(sizeField?.options).toContain('M');
      expect(sizeField?.options).toContain('GG');
    });
  });

  describe('Asset Type CRUD', () => {
    it('should create a new asset type', () => {
      const request: CreateAssetTypeRequest = {
        name: 'Eletrônicos',
        description: 'Dispositivos eletrônicos',
        icon: '📱',
        fields: [
          {
            name: 'Marca',
            slug: 'marca',
            type: 'text',
            required: true,
            order: 0,
          },
          {
            name: 'Modelo',
            slug: 'modelo',
            type: 'text',
            required: true,
            order: 1,
          },
          {
            name: 'Potência (W)',
            slug: 'potencia',
            type: 'number',
            required: false,
            validation: { min: 0 },
            order: 2,
          },
        ],
      };

      const assetType = service.createAssetType(request);

      expect(assetType.id).toBeDefined();
      expect(assetType.name).toBe('Eletrônicos');
      expect(assetType.slug).toBe('eletr-nicos'); // Slug removes accents
      expect(assetType.fields).toHaveLength(3);
    });

    it('should get asset type by ID', () => {
      const created = service.createAssetType({
        name: 'Test Type',
        fields: [],
      });

      const retrieved = service.getAssetType(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should get asset type by slug', () => {
      const created = service.createAssetType({
        name: 'Test Slug Type',
        fields: [],
      });

      const retrieved = service.getAssetTypeBySlug('test-slug-type');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should update asset type', () => {
      const created = service.createAssetType({
        name: 'Original Name',
        fields: [],
      });

      const updated = service.updateAssetType(created.id, {
        name: 'Updated Name',
        isActive: false,
      });

      expect(updated).toBeDefined();
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.isActive).toBe(false);
    });

    it('should delete asset type', () => {
      const created = service.createAssetType({
        name: 'To Delete',
        fields: [],
      });

      const deleted = service.deleteAssetType(created.id);
      expect(deleted).toBe(true);

      const retrieved = service.getAssetType(created.id);
      expect(retrieved).toBeNull();
    });

    it('should filter active only asset types', () => {
      service.createAssetType({
        name: 'Active Type',
        fields: [],
      });

      const inactive = service.createAssetType({
        name: 'Inactive Type',
        fields: [],
      });

      service.updateAssetType(inactive.id, { isActive: false });

      const allTypes = service.listAssetTypes(false);
      const activeTypes = service.listAssetTypes(true);

      expect(allTypes.length).toBeGreaterThan(activeTypes.length);
      expect(activeTypes.find(t => t.name === 'Inactive Type')).toBeUndefined();
    });
  });

  describe('Custom Field Values', () => {
    it('should set custom field value for asset', () => {
      const assetId = 'asset-123';
      const mobiliario = service.getAssetTypeBySlug('mobiliario');
      const materialField = mobiliario?.fields.find(f => f.slug === 'material');

      expect(materialField).toBeDefined();

      const value = service.setCustomFieldValue(assetId, {
        fieldId: materialField!.id,
        value: 'Madeira',
      });

      expect(value.assetId).toBe(assetId);
      expect(value.value).toBe('Madeira');
    });

    it('should set multiple custom field values at once', () => {
      const assetId = 'asset-456';
      const mobiliario = service.getAssetTypeBySlug('mobiliario');
      const fields = mobiliario?.fields || [];

      const values: Record<string, any> = {};
      for (const field of fields) {
        values[field.id] = field.defaultValue ?? 'test';
      }

      const result = service.setCustomFieldValues(assetId, { values });

      expect(result.length).toBe(fields.length);
    });

    it('should get custom field values for asset', () => {
      const assetId = 'asset-789';
      const mobiliario = service.getAssetTypeBySlug('mobiliario');
      const materialField = mobiliario?.fields.find(f => f.slug === 'material');

      service.setCustomFieldValue(assetId, {
        fieldId: materialField!.id,
        value: 'Metal',
      });

      const values = service.getCustomFieldValues(assetId);

      expect(values[materialField!.id]).toBe('Metal');
    });

    it('should get custom fields with values for asset', () => {
      const assetId = 'asset-fields-test';
      const mobiliario = service.getAssetTypeBySlug('mobiliario');
      const mobiliarioId = mobiliario?.id || '';

      // Get the actual field IDs
      const materialField = mobiliario?.fields.find(f => f.slug === 'material');
      const dimensoesField = mobiliario?.fields.find(f => f.slug === 'dimensoes');
      const pesoField = mobiliario?.fields.find(f => f.slug === 'peso');

      // Set values using actual field IDs
      const values: Record<string, any> = {};
      values[materialField!.id] = 'Vidro';
      values[dimensoesField!.id] = '100x50x40';
      values[pesoField!.id] = 15;

      const setResults = service.setCustomFieldValues(assetId, { values });

      const fieldsWithValues = service.getCustomFieldsWithValues(assetId, mobiliarioId);

      expect(fieldsWithValues.length).toBeGreaterThan(0);

      const material = fieldsWithValues.find(f => f.slug === 'material');
      expect(material?.value).toBe('Vidro');
    });
  });

  describe('Validation', () => {
    it('should validate required field', () => {
      const mobiliario = service.getAssetTypeBySlug('mobiliario');
      const mobiliarioId = mobiliario?.id || '';

      const result = service.validateCustomFieldValues(mobiliarioId, {});

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      const materialError = result.errors.find(e => e.fieldName === 'Material');
      expect(materialError).toBeDefined();
    });

    it('should validate number field min/max', () => {
      const mobiliario = service.getAssetTypeBySlug('mobiliario');
      const mobiliarioId = mobiliario?.id || '';

      // Get the actual field ID from the asset type
      const pesoField = mobiliario?.fields.find(f => f.slug === 'peso');
      const values: Record<string, any> = {
        material: 'Madeira',
        dimensoes: '100x50x40',
        [pesoField!.id]: -5, // Negative weight
      };

      const result = service.validateCustomFieldValues(mobiliarioId, values);

      expect(result.valid).toBe(false);

      const weightError = result.errors.find(e => e.fieldId === pesoField!.id);
      expect(weightError?.errors.length).toBeGreaterThan(0);
    });

    it('should validate select field options', () => {
      const mobiliario = service.getAssetTypeBySlug('mobiliario');
      const mobiliarioId = mobiliario?.id || '';

      // Build values map with actual field IDs
      const materialField = mobiliario?.fields.find(f => f.slug === 'material');
      const dimensoesField = mobiliario?.fields.find(f => f.slug === 'dimensoes');
      const pesoField = mobiliario?.fields.find(f => f.slug === 'peso');

      const values: Record<string, any> = {};
      values[materialField!.id] = 'Madeira';
      values[dimensoesField!.id] = '100x50x40';
      values[pesoField!.id] = 10;

      const result = service.validateCustomFieldValues(mobiliarioId, values);

      expect(result.valid).toBe(true);
    });

    it('should reject invalid select option', () => {
      const mobiliario = service.getAssetTypeBySlug('mobiliario');
      const mobiliarioId = mobiliario?.id || '';

      // Build values map with actual field IDs
      const materialField = mobiliario?.fields.find(f => f.slug === 'material');
      const dimensoesField = mobiliario?.fields.find(f => f.slug === 'dimensoes');
      const pesoField = mobiliario?.fields.find(f => f.slug === 'peso');

      const values: Record<string, any> = {};
      values[materialField!.id] = 'Opção Inválida';
      values[dimensoesField!.id] = '100x50x40';
      values[pesoField!.id] = 10;

      const result = service.validateCustomFieldValues(mobiliarioId, values);

      expect(result.valid).toBe(false);

      const materialError = result.errors.find(e => e.fieldId === materialField!.id);
      expect(materialError?.errors.length).toBeGreaterThan(0);
    });
  });
});
