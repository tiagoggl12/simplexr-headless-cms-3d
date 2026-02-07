/**
 * Custom Fields / Metadados Models
 * Allows dynamic schema customization per asset type for business flexibility.
 */

/**
 * Supported field types for custom fields
 */
export type CustomFieldType = 'text' | 'number' | 'date' | 'select' | 'boolean' | 'json';

/**
 * Validation rules for a custom field
 */
export interface FieldValidation {
  min?: number;
  max?: number;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
}

/**
 * A custom field definition
 */
export interface CustomField {
  id: string;
  name: string;
  slug: string; // URL-safe identifier
  type: CustomFieldType;
  required: boolean;
  defaultValue?: any;
  options?: string[]; // for type 'select'
  validation?: FieldValidation;
  description?: string;
  placeholder?: string;
  order: number; // for UI ordering
}

/**
 * Asset Type Schema with custom fields
 */
export interface AssetTypeSchema {
  id: string;
  name: string; // e.g., 'Mobiliário', 'Vestuário', 'Acessórios'
  slug: string; // URL-safe identifier
  description?: string;
  icon?: string;
  fields: CustomField[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Value of a custom field for a specific asset
 */
export interface CustomFieldValue {
  id: string;
  assetId: string;
  fieldId: string;
  value: any; // Typed value based on field type
  createdAt: string;
  updatedAt: string;
}

/**
 * Extended asset with custom field values
 */
export interface AssetWithCustomFields {
  assetId: string;
  customFields: Record<string, any>; // slug -> value mapping
}

/**
 * Request types for API
 */
export interface CreateAssetTypeRequest {
  name: string;
  description?: string;
  icon?: string;
  fields: Omit<CustomField, 'id'>[];
}

export interface UpdateAssetTypeRequest {
  name?: string;
  description?: string;
  icon?: string;
  fields?: Omit<CustomField, 'id'>[];
  isActive?: boolean;
}

export interface SetCustomFieldValueRequest {
  fieldId: string;
  value: any;
}

export interface SetCustomFieldValuesRequest {
  values: Record<string, any>; // slug -> value mapping
}

/**
 * Validation error for custom field values
 */
export interface FieldValidationError {
  fieldId: string;
  fieldName: string;
  errors: string[];
}

/**
 * Result of custom field validation
 */
export interface ValidationResult {
  valid: boolean;
  errors: FieldValidationError[];
}

/**
 * Helper to get default value for a field type
 */
export function getDefaultValueForType(type: CustomFieldType): any {
  switch (type) {
    case 'text':
      return '';
    case 'number':
      return 0;
    case 'date':
      return null;
    case 'select':
      return null;
    case 'boolean':
      return false;
    case 'json':
      return null;
    default:
      return null;
  }
}

/**
 * Validate a value against field definition
 */
export function validateFieldValue(value: any, field: CustomField): string[] {
  const errors: string[] = [];

  // Check required
  if (field.required && (value === null || value === undefined || value === '')) {
    errors.push('This field is required');
    return errors;
  }

  // Skip validation if value is empty and not required
  if (!field.required && (value === null || value === undefined || value === '')) {
    return errors;
  }

  // Type-specific validation
  switch (field.type) {
    case 'number':
      if (typeof value !== 'number' || isNaN(value)) {
        errors.push('Must be a valid number');
      } else {
        if (field.validation?.min !== undefined && value < field.validation.min) {
          errors.push(`Must be at least ${field.validation.min}`);
        }
        if (field.validation?.max !== undefined && value > field.validation.max) {
          errors.push(`Must be at most ${field.validation.max}`);
        }
      }
      break;

    case 'text':
      if (typeof value !== 'string') {
        errors.push('Must be a string');
      } else {
        if (field.validation?.minLength !== undefined && value.length < field.validation.minLength) {
          errors.push(`Must be at least ${field.validation.minLength} characters`);
        }
        if (field.validation?.maxLength !== undefined && value.length > field.validation.maxLength) {
          errors.push(`Must be at most ${field.validation.maxLength} characters`);
        }
        if (field.validation?.pattern) {
          const regex = new RegExp(field.validation.pattern);
          if (!regex.test(value)) {
            errors.push('Format is invalid');
          }
        }
      }
      break;

    case 'select':
      if (field.options && !field.options.includes(value)) {
        errors.push(`Must be one of: ${field.options.join(', ')}`);
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        errors.push('Must be true or false');
      }
      break;

    case 'date':
      if (!(value instanceof Date || typeof value === 'string' || typeof value === 'number')) {
        errors.push('Must be a valid date');
      }
      break;

    case 'json':
      if (value !== null && typeof value !== 'object') {
        errors.push('Must be a valid JSON object');
      }
      break;
  }

  return errors;
}

/**
 * Create a slug from a name
 */
export function createSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, ''); // Trim hyphens
}
