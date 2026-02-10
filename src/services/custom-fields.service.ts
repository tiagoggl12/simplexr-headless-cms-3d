/**
 * Custom Fields Service
 * Manages dynamic schema customization per asset type
 */

import { randomBytes } from 'node:crypto';
import type {
  AssetTypeSchema,
  CustomField,
  CustomFieldValue,
  CreateAssetTypeRequest,
  UpdateAssetTypeRequest,
  SetCustomFieldValueRequest,
  SetCustomFieldValuesRequest,
  ValidationResult,
  FieldValidationError,
} from '../models/custom-fields.js';
import {
  createSlug,
  validateFieldValue,
  getDefaultValueForType,
} from '../models/custom-fields.js';

/**
 * In-memory store for asset types and custom field values
 * In production, this would be replaced with PostgreSQL
 */
interface AssetTypeData {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  fields: CustomField[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Custom Fields Store
 */
class CustomFieldsStore {
  private assetTypes = new Map<string, AssetTypeData>();
  private assetTypesBySlug = new Map<string, AssetTypeData>();
  private customFieldValues = new Map<string, CustomFieldValue>();
  private valuesByAsset = new Map<string, CustomFieldValue[]>();

  // Asset Type CRUD
  getAssetType(id: string): AssetTypeData | undefined {
    return this.assetTypes.get(id);
  }

  getAssetTypeBySlug(slug: string): AssetTypeData | undefined {
    return this.assetTypesBySlug.get(slug);
  }

  listAssetTypes(activeOnly = false): AssetTypeData[] {
    const all = Array.from(this.assetTypes.values());
    if (activeOnly) {
      return all.filter(at => at.isActive);
    }
    return all;
  }

  createAssetType(data: Omit<AssetTypeData, 'id' | 'createdAt' | 'updatedAt'>): AssetTypeData {
    const now = new Date().toISOString();
    const id = `asset_type_${randomBytes(16).toString('hex')}`;

    // Ensure fields have IDs and slugs
    const fields: CustomField[] = data.fields.map((field, index) => ({
      ...field,
      id: `field_${randomBytes(16).toString('hex')}`,
      slug: field.slug || createSlug(field.name),
      order: field.order ?? index,
    }));

    const assetType: AssetTypeData = {
      ...data,
      id,
      fields,
      createdAt: now,
      updatedAt: now,
    };

    this.assetTypes.set(id, assetType);
    this.assetTypesBySlug.set(assetType.slug, assetType);

    return assetType;
  }

  updateAssetType(id: string, updates: Partial<UpdateAssetTypeRequest>): AssetTypeData | undefined {
    const assetType = this.assetTypes.get(id);
    if (!assetType) return undefined;

    // Handle fields update
    let fields = assetType.fields;
    if (updates.fields !== undefined) {
      fields = updates.fields.map((field, index) => {
        const existing = assetType.fields.find(f => f.id === (field as CustomField).id);
        return {
          id: (field as CustomField).id || existing?.id || `field_${randomBytes(16).toString('hex')}`,
          ...field,
          slug: (field as CustomField).slug || createSlug((field as CustomField).name),
          order: (field as CustomField).order ?? index,
        } as CustomField;
      });
    }

    const updated: AssetTypeData = {
      ...assetType,
      name: updates.name ?? assetType.name,
      slug: (updates as any).slug ?? assetType.slug,
      description: updates.description ?? assetType.description,
      icon: updates.icon ?? assetType.icon,
      fields,
      isActive: updates.isActive ?? assetType.isActive,
      updatedAt: new Date().toISOString(),
    };

    this.assetTypes.set(id, updated);
    if (updated.slug !== assetType.slug) {
      this.assetTypesBySlug.delete(assetType.slug);
      this.assetTypesBySlug.set(updated.slug, updated);
    }

    return updated;
  }

  deleteAssetType(id: string): boolean {
    const assetType = this.assetTypes.get(id);
    if (!assetType) return false;

    this.assetTypes.delete(id);
    this.assetTypesBySlug.delete(assetType.slug);

    // Delete all custom field values for this asset type
    for (const value of this.customFieldValues.values()) {
      // Note: In a real implementation, you'd check assetTypeId
    }

    return true;
  }

  // Custom Field Values CRUD
  getCustomFieldValue(id: string): CustomFieldValue | undefined {
    return this.customFieldValues.get(id);
  }

  getCustomFieldValuesByAsset(assetId: string): CustomFieldValue[] {
    return this.valuesByAsset.get(assetId) || [];
  }

  setCustomFieldValue(
    assetId: string,
    fieldId: string,
    value: any
  ): CustomFieldValue {
    // Check if value already exists
    const existing = Array.from(this.customFieldValues.values()).find(
      v => v.assetId === assetId && v.fieldId === fieldId
    );

    const now = new Date().toISOString();

    if (existing) {
      existing.value = value;
      existing.updatedAt = now;
      return existing;
    }

    const newValue: CustomFieldValue = {
      id: `cfv_${randomBytes(16).toString('hex')}`,
      assetId,
      fieldId,
      value,
      createdAt: now,
      updatedAt: now,
    };

    this.customFieldValues.set(newValue.id, newValue);

    const values = this.valuesByAsset.get(assetId) || [];
    values.push(newValue);
    this.valuesByAsset.set(assetId, values);

    return newValue;
  }

  setCustomFieldValues(assetId: string, values: Record<string, any>): CustomFieldValue[] {
    const result: CustomFieldValue[] = [];

    for (const [fieldId, value] of Object.entries(values)) {
      result.push(this.setCustomFieldValue(assetId, fieldId, value));
    }

    return result;
  }

  deleteCustomFieldValue(id: string): boolean {
    const value = this.customFieldValues.get(id);
    if (!value) return false;

    this.customFieldValues.delete(id);

    const values = this.valuesByAsset.get(value.assetId) || [];
    const index = values.findIndex(v => v.id === id);
    if (index !== -1) {
      values.splice(index, 1);
    }

    return true;
  }
}

/**
 * Custom Fields Service
 */
export class CustomFieldsService {
  private store: CustomFieldsStore;

  constructor() {
    this.store = new CustomFieldsStore();
    this.createDefaultAssetTypes();
  }

  /**
   * Create default asset types
   */
  private createDefaultAssetTypes(): void {
    // Furniture / Mobiliário
    this.store.createAssetType({
      name: 'Mobiliário',
      slug: 'mobiliario',
      description: 'Móveis para ambientes internos e externos',
      icon: '🪑',
      isActive: true,
      fields: [
        {
          id: 'field_material',
          name: 'Material',
          slug: 'material',
          type: 'select',
          required: true,
          options: ['Madeira', 'Metal', 'Plástico', 'Vidro', 'Estofado', 'Pedra'],
          order: 0,
        },
        {
          id: 'field_dimensions',
          name: 'Dimensões (cm)',
          slug: 'dimensoes',
          type: 'text',
          required: true,
          placeholder: 'Ex: 200x80x75',
          order: 1,
        },
        {
          id: 'field_weight',
          name: 'Peso (kg)',
          slug: 'peso',
          type: 'number',
          required: false,
          validation: { min: 0 },
          order: 2,
        },
        {
          id: 'field_color',
          name: 'Cor Principal',
          slug: 'cor',
          type: 'text',
          required: false,
          order: 3,
        },
        {
          id: 'field_assembly_required',
          name: 'Requer Montagem',
          slug: 'requer_montagem',
          type: 'boolean',
          required: false,
          defaultValue: false,
          order: 4,
        },
      ],
    });

    // Clothing / Vestuário
    this.store.createAssetType({
      name: 'Vestuário',
      slug: 'vestuario',
      description: 'Roupas e acessórios de vestuário',
      icon: '👕',
      isActive: true,
      fields: [
        {
          id: 'field_size',
          name: 'Tamanho',
          slug: 'tamanho',
          type: 'select',
          required: true,
          options: ['PP', 'P', 'M', 'G', 'GG', 'XG'],
          order: 0,
        },
        {
          id: 'field_gender',
          name: 'Gênero',
          slug: 'genero',
          type: 'select',
          required: true,
          options: ['Masculino', 'Feminino', 'Unissex'],
          order: 1,
        },
        {
          id: 'field_season',
          name: 'Estação',
          slug: 'estacao',
          type: 'select',
          required: false,
          options: ['Verão', 'Inverno', 'Primavera', 'Outono', 'Todas'],
          order: 2,
        },
        {
          id: 'field_fabric',
          name: 'Tecido',
          slug: 'tecido',
          type: 'text',
          required: false,
          order: 3,
        },
      ],
    });

    // Accessories / Acessórios
    this.store.createAssetType({
      name: 'Acessórios',
      slug: 'acessorios',
      description: 'Acessórios e itens decorativos',
      icon: '✨',
      isActive: true,
      fields: [
        {
          id: 'field_category',
          name: 'Categoria',
          slug: 'categoria_acessorio',
          type: 'select',
          required: true,
          options: ['Joias', 'Bolsas', 'Óculos', 'Relógios', 'Chapéus', 'Outros'],
          order: 0,
        },
        {
          id: 'field_brand',
          name: 'Marca',
          slug: 'marca',
          type: 'text',
          required: false,
          order: 1,
        },
        {
          id: 'field_material',
          name: 'Material Principal',
          slug: 'material_principal',
          type: 'text',
          required: false,
          order: 2,
        },
      ],
    });
  }

  /**
   * List all asset types
   */
  listAssetTypes(activeOnly = false): AssetTypeSchema[] {
    return this.store.listAssetTypes(activeOnly);
  }

  /**
   * Get asset type by ID
   */
  getAssetType(id: string): AssetTypeSchema | null {
    const assetType = this.store.getAssetType(id);
    if (!assetType) return null;
    return this.mapToSchema(assetType);
  }

  /**
   * Get asset type by slug
   */
  getAssetTypeBySlug(slug: string): AssetTypeSchema | null {
    const assetType = this.store.getAssetTypeBySlug(slug);
    if (!assetType) return null;
    return this.mapToSchema(assetType);
  }

  /**
   * Create asset type
   */
  createAssetType(data: CreateAssetTypeRequest): AssetTypeSchema {
    const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const assetType = this.store.createAssetType({
      name: data.name,
      slug,
      description: data.description,
      icon: data.icon,
      fields: data.fields as CustomField[],
      isActive: true,
    });

    return this.mapToSchema(assetType);
  }

  /**
   * Update asset type
   */
  updateAssetType(id: string, updates: UpdateAssetTypeRequest): AssetTypeSchema | null {
    const assetType = this.store.updateAssetType(id, updates);
    if (!assetType) return null;
    return this.mapToSchema(assetType);
  }

  /**
   * Delete asset type
   */
  deleteAssetType(id: string): boolean {
    return this.store.deleteAssetType(id);
  }

  /**
   * Get custom field values for an asset
   */
  getCustomFieldValues(assetId: string): Record<string, any> {
    const values = this.store.getCustomFieldValuesByAsset(assetId);
    const result: Record<string, any> = {};

    for (const value of values) {
      result[value.fieldId] = value.value;
    }

    return result;
  }

  /**
   * Get custom field values with field definitions
   */
  getCustomFieldsWithValues(assetId: string, assetTypeId: string): Array<CustomField & { value: any }> {
    const assetType = this.store.getAssetType(assetTypeId);
    if (!assetType) return [];

    const values = this.store.getCustomFieldValuesByAsset(assetId);
    const valueMap = new Map(values.map(v => [v.fieldId, v.value]));

    return assetType.fields.map(field => ({
      ...field,
      value: valueMap.get(field.id) ?? field.defaultValue ?? getDefaultValueForType(field.type),
    }));
  }

  /**
   * Set custom field value for an asset
   */
  setCustomFieldValue(assetId: string, request: SetCustomFieldValueRequest): CustomFieldValue {
    return this.store.setCustomFieldValue(assetId, request.fieldId, request.value);
  }

  /**
   * Set multiple custom field values for an asset
   */
  setCustomFieldValues(assetId: string, request: SetCustomFieldValuesRequest): CustomFieldValue[] {
    return this.store.setCustomFieldValues(assetId, request.values);
  }

  /**
   * Validate custom field values for an asset type
   */
  validateCustomFieldValues(
    assetTypeId: string,
    values: Record<string, any>
  ): ValidationResult {
    const assetType = this.store.getAssetType(assetTypeId);
    if (!assetType) {
      return {
        valid: false,
        errors: [{ fieldId: '', fieldName: '', errors: ['Asset type not found'] }],
      };
    }

    const errors: FieldValidationError[] = [];

    for (const field of assetType.fields) {
      const value = values[field.id];
      const fieldErrors = validateFieldValue(value, field);

      if (fieldErrors.length > 0) {
        errors.push({
          fieldId: field.id,
          fieldName: field.name,
          errors: fieldErrors,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Map internal data to schema
   */
  private mapToSchema(data: AssetTypeData): AssetTypeSchema {
    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      description: data.description,
      icon: data.icon,
      fields: data.fields,
      isActive: data.isActive,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }
}

/**
 * Service singleton
 */
let customFieldsServiceInstance: CustomFieldsService | null = null;

export function getCustomFieldsService(): CustomFieldsService {
  if (!customFieldsServiceInstance) {
    customFieldsServiceInstance = new CustomFieldsService();
  }
  return customFieldsServiceInstance;
}

export function createCustomFieldsService(): CustomFieldsService {
  return new CustomFieldsService();
}
