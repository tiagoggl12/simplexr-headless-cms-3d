/**
 * Custom Fields / Asset Types Routes
 * API endpoints for managing asset types and custom field values
 */

import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { getCustomFieldsService } from '../services/custom-fields.service.js';
import type { CustomFieldType } from '../models/custom-fields.js';

// Validation schemas
const customFieldSchema = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  type: z.enum(['text', 'number', 'date', 'select', 'boolean', 'json']),
  required: z.boolean().optional().default(false),
  defaultValue: z.any().optional(),
  options: z.array(z.string()).optional(),
  validation: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
  }).optional(),
  description: z.string().optional(),
  placeholder: z.string().optional(),
  order: z.number().optional(),
});

const createAssetTypeSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  icon: z.string().optional(),
  fields: z.array(customFieldSchema.omit({ id: true })),
});

const updateAssetTypeSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  fields: z.array(customFieldSchema.partial()).optional(),
  isActive: z.boolean().optional(),
});

const setCustomFieldValueSchema = z.object({
  fieldId: z.string(),
  value: z.any(),
});

const setCustomFieldValuesSchema = z.object({
  values: z.record(z.any()),
});

/**
 * Register custom fields routes
 */
export async function registerAssetTypesRoutes(
  app: FastifyInstance,
  options: { prefix?: string } = {}
): Promise<void> {
  const prefix = options.prefix || '/asset-types';
  const service = getCustomFieldsService();

  // GET /asset-types - List all asset types
  app.get(`${prefix}`, async (request, reply) => {
    const query = request.query as { active_only?: string };
    const activeOnly = query.active_only === 'true';

    const assetTypes = service.listAssetTypes(activeOnly);
    return reply.send({ items: assetTypes });
  });

  // GET /asset-types/:id - Get asset type by ID
  app.get(`${prefix}/:id`, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const assetType = service.getAssetType(id);

    if (!assetType) {
      return reply.status(404).send({ error: 'asset_type_not_found' });
    }

    return reply.send(assetType);
  });

  // POST /asset-types - Create new asset type
  app.post(`${prefix}`, async (request, reply) => {
    const payload = createAssetTypeSchema.parse(request.body);

    try {
      const assetType = service.createAssetType(payload);
      return reply.status(201).send(assetType);
    } catch (error) {
      const err = error as Error;
      return reply.status(400).send({ error: err.message });
    }
  });

  // PATCH /asset-types/:id - Update asset type
  app.patch(`${prefix}/:id`, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const payload = updateAssetTypeSchema.parse(request.body);

    try {
      const assetType = service.updateAssetType(id, payload);

      if (!assetType) {
        return reply.status(404).send({ error: 'asset_type_not_found' });
      }

      return reply.send(assetType);
    } catch (error) {
      const err = error as Error;
      return reply.status(400).send({ error: err.message });
    }
  });

  // DELETE /asset-types/:id - Delete asset type
  app.delete(`${prefix}/:id`, async (request, reply) => {
    const id = (request.params as { id: string }).id;

    const deleted = service.deleteAssetType(id);

    if (!deleted) {
      return reply.status(404).send({ error: 'asset_type_not_found' });
    }

    return reply.status(204).send();
  });

  // ============================================
  // Custom Field Values Routes
  // ============================================

  // GET /assets/:id/custom-fields - Get custom field values for an asset
  app.get('/assets/:id/custom-fields', async (request, reply) => {
    const assetId = (request.params as { id: string }).id;
    const query = request.query as { asset_type_id?: string };

    if (query.asset_type_id) {
      const fields = service.getCustomFieldsWithValues(assetId, query.asset_type_id);
      return reply.send({ assetId, fields });
    }

    const values = service.getCustomFieldValues(assetId);
    return reply.send({ assetId, values });
  });

  // PATCH /assets/:id/custom-fields - Set a single custom field value
  app.patch('/assets/:id/custom-fields', async (request, reply) => {
    const assetId = (request.params as { id: string }).id;
    const payload = setCustomFieldValueSchema.parse(request.body);

    try {
      const value = service.setCustomFieldValue(assetId, payload);
      return reply.send(value);
    } catch (error) {
      const err = error as Error;
      return reply.status(400).send({ error: err.message });
    }
  });

  // PUT /assets/:id/custom-fields/bulk - Set multiple custom field values
  app.put('/assets/:id/custom-fields/bulk', async (request, reply) => {
    const assetId = (request.params as { id: string }).id;
    const payload = setCustomFieldValuesSchema.parse(request.body);

    try {
      const values = service.setCustomFieldValues(assetId, payload);
      return reply.send({ assetId, values });
    } catch (error) {
      const err = error as Error;
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /asset-types/:id/validate - Validate custom field values
  app.post(`${prefix}/:id/validate`, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const payload = z.object({ values: z.record(z.any()) }).parse(request.body);

    const result = service.validateCustomFieldValues(id, payload.values);
    return reply.send(result);
  });
}
