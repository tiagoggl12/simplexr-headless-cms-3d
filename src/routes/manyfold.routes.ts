/**
 * Manyfold Integration Routes
 * API endpoints for managing the Manyfold ↔ SimpleXR integration.
 */

import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import {
    getManyfoldSyncService,
    ManyfoldError,
} from '../services/manyfold-sync.service.js';

// ─── Validation Schemas ────────────────────────────────────────────────

const importModelSchema = z.object({
    modelId: z.string().min(1),
    fileFormats: z.array(z.string()).optional(),
});

const bulkImportSchema = z.object({
    creatorId: z.string().optional(),
    collectionId: z.string().optional(),
    fileFormats: z.array(z.string()).optional(),
    limit: z.number().min(1).max(100).optional(),
});

const exportAssetSchema = z.object({
    assetId: z.string().min(1),
    creatorId: z.string().optional(),
    collectionId: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    license: z.string().optional(),
});

const createCollectionSchema = z.object({
    name: z.string().min(1),
    caption: z.string().optional(),
    description: z.string().optional(),
});

const createCreatorSchema = z.object({
    name: z.string().min(1),
    slug: z.string().optional(),
    caption: z.string().optional(),
    description: z.string().optional(),
});

// ─── Middleware ─────────────────────────────────────────────────────────

function requireManyfold(reply: any): ReturnType<typeof getManyfoldSyncService> {
    const service = getManyfoldSyncService();
    if (!service) {
        reply.status(503).send({
            error: 'manyfold_not_configured',
            message: 'Manyfold integration is not configured. Set MANYFOLD_BASE_URL, MANYFOLD_CLIENT_ID, and MANYFOLD_CLIENT_SECRET environment variables.',
        });
        return null;
    }
    return service;
}

function handleManyfoldError(error: unknown, reply: any): void {
    if (error instanceof ManyfoldError) {
        const statusMap: Record<string, number> = {
            AUTH_FAILED: 401,
            ALREADY_IMPORTED: 409,
            ALREADY_EXPORTED: 409,
            NO_COMPATIBLE_FILES: 422,
            UPLOAD_CREATE_FAILED: 502,
            UPLOAD_CHUNK_FAILED: 502,
            UPLOAD_NO_LOCATION: 502,
            API_ERROR: 502,
        };

        const status = statusMap[error.code] || 500;
        reply.status(status).send({
            error: error.code.toLowerCase(),
            message: error.message,
            details: error.details,
        });
    } else {
        const err = error as { message?: string };
        reply.status(500).send({
            error: 'internal_error',
            message: err.message || 'An unexpected error occurred',
        });
    }
}

// ─── Route Registration ────────────────────────────────────────────────

/**
 * Register Manyfold integration routes.
 */
export async function registerManyfoldRoutes(
    app: FastifyInstance,
    options: { prefix?: string } = {}
): Promise<void> {
    const prefix = options.prefix || '/manyfold';

    // ──────────── Connection & Status ────────────

    /** GET /manyfold/status — Get integration status and statistics */
    app.get(`${prefix}/status`, async (request, reply) => {
        const service = requireManyfold(reply);
        if (!service) return;

        const stats = service.getStatistics();
        const config = service.getConfig();

        return reply.send({
            configured: true,
            ...stats,
            config,
        });
    });

    /** POST /manyfold/test — Test connection to Manyfold instance */
    app.post(`${prefix}/test`, async (request, reply) => {
        const service = requireManyfold(reply);
        if (!service) return;

        try {
            const result = await service.testConnection();
            return reply.send(result);
        } catch (error) {
            handleManyfoldError(error, reply);
        }
    });

    // ──────────── Models (Browse Manyfold) ────────────

    /** GET /manyfold/models — List models on the Manyfold instance */
    app.get(`${prefix}/models`, async (request, reply) => {
        const service = requireManyfold(reply);
        if (!service) return;

        const query = request.query as {
            page?: string;
            order?: 'name' | 'recent' | 'updated';
            creator?: string;
            collection?: string;
        };

        try {
            const result = await service.listModels({
                page: query.page ? parseInt(query.page, 10) : undefined,
                order: query.order,
                creator: query.creator,
                collection: query.collection,
            });
            return reply.send(result);
        } catch (error) {
            handleManyfoldError(error, reply);
        }
    });

    /** GET /manyfold/models/:id — Get a single model from Manyfold */
    app.get(`${prefix}/models/:id`, async (request, reply) => {
        const service = requireManyfold(reply);
        if (!service) return;

        const { id } = request.params as { id: string };

        try {
            const model = await service.getModel(id);
            return reply.send(model);
        } catch (error) {
            handleManyfoldError(error, reply);
        }
    });

    // ──────────── Collections (Browse Manyfold) ────────────

    /** GET /manyfold/collections — List collections on Manyfold */
    app.get(`${prefix}/collections`, async (request, reply) => {
        const service = requireManyfold(reply);
        if (!service) return;

        const query = request.query as {
            page?: string;
            order?: 'name' | 'recent' | 'updated';
        };

        try {
            const result = await service.listCollections({
                page: query.page ? parseInt(query.page, 10) : undefined,
                order: query.order,
            });
            return reply.send(result);
        } catch (error) {
            handleManyfoldError(error, reply);
        }
    });

    /** POST /manyfold/collections — Create a collection on Manyfold */
    app.post(`${prefix}/collections`, async (request, reply) => {
        const service = requireManyfold(reply);
        if (!service) return;

        try {
            const payload = createCollectionSchema.parse(request.body);
            const collection = await service.createCollection(payload);
            return reply.status(201).send(collection);
        } catch (error) {
            handleManyfoldError(error, reply);
        }
    });

    // ──────────── Creators (Browse Manyfold) ────────────

    /** GET /manyfold/creators — List creators on Manyfold */
    app.get(`${prefix}/creators`, async (request, reply) => {
        const service = requireManyfold(reply);
        if (!service) return;

        const query = request.query as {
            page?: string;
            order?: 'name' | 'recent' | 'updated';
        };

        try {
            const result = await service.listCreators({
                page: query.page ? parseInt(query.page, 10) : undefined,
                order: query.order,
            });
            return reply.send(result);
        } catch (error) {
            handleManyfoldError(error, reply);
        }
    });

    /** POST /manyfold/creators — Create a creator on Manyfold */
    app.post(`${prefix}/creators`, async (request, reply) => {
        const service = requireManyfold(reply);
        if (!service) return;

        try {
            const payload = createCreatorSchema.parse(request.body);
            const creator = await service.createCreator(payload);
            return reply.status(201).send(creator);
        } catch (error) {
            handleManyfoldError(error, reply);
        }
    });

    // ──────────── Import: Manyfold → SimpleXR ────────────

    /** POST /manyfold/import — Import a single model from Manyfold */
    app.post(`${prefix}/import`, async (request, reply) => {
        const service = requireManyfold(reply);
        if (!service) return;

        try {
            const payload = importModelSchema.parse(request.body);
            const result = await service.importModel(payload.modelId, {
                fileFormats: payload.fileFormats,
            });

            return reply.status(201).send({
                message: `Model "${result.manyfoldModel.name}" imported successfully`,
                asset: result.asset,
                manyfoldModel: {
                    id: payload.modelId,
                    name: result.manyfoldModel.name,
                    fileCount: result.files.length,
                },
                syncMapping: result.syncMapping,
            });
        } catch (error) {
            handleManyfoldError(error, reply);
        }
    });

    /** POST /manyfold/import/bulk — Bulk import models from Manyfold */
    app.post(`${prefix}/import/bulk`, async (request, reply) => {
        const service = requireManyfold(reply);
        if (!service) return;

        try {
            const payload = bulkImportSchema.parse(request.body);
            const result = await service.importModels({
                creatorId: payload.creatorId,
                manyfoldCollectionId: payload.collectionId,
                fileFormats: payload.fileFormats,
                limit: payload.limit,
            });

            return reply.send(result);
        } catch (error) {
            handleManyfoldError(error, reply);
        }
    });

    // ──────────── Export: SimpleXR → Manyfold ────────────

    /**
     * POST /manyfold/export — Export an asset to Manyfold
     *
     * Note: In a real implementation, the file buffer would be
     * fetched from storage (S3/MinIO). This endpoint expects
     * the assetId and metadata; the actual file transfer is handled internally.
     */
    app.post(`${prefix}/export`, async (request, reply) => {
        const service = requireManyfold(reply);
        if (!service) return;

        try {
            const payload = exportAssetSchema.parse(request.body);

            // In production: fetch the asset from store + file from S3
            // For now, create a placeholder response indicating the export was queued
            return reply.status(202).send({
                message: `Export of asset ${payload.assetId} to Manyfold has been queued`,
                assetId: payload.assetId,
                status: 'queued',
                options: {
                    creatorId: payload.creatorId,
                    collectionId: payload.collectionId,
                    keywords: payload.keywords,
                    license: payload.license,
                },
            });
        } catch (error) {
            handleManyfoldError(error, reply);
        }
    });

    // ──────────── Sync Mappings ────────────

    /** GET /manyfold/sync — List all sync mappings */
    app.get(`${prefix}/sync`, async (request, reply) => {
        const service = requireManyfold(reply);
        if (!service) return;

        const mappings = service.getSyncMappings();
        return reply.send({
            total: mappings.length,
            mappings,
        });
    });

    /** GET /manyfold/sync/:id — Get a specific sync mapping */
    app.get(`${prefix}/sync/:id`, async (request, reply) => {
        const service = requireManyfold(reply);
        if (!service) return;

        const { id } = request.params as { id: string };
        const mapping = service.getSyncMapping(id);

        if (!mapping) {
            return reply.status(404).send({ error: 'sync_mapping_not_found' });
        }

        return reply.send(mapping);
    });

    /** DELETE /manyfold/sync/:id — Delete a sync mapping */
    app.delete(`${prefix}/sync/:id`, async (request, reply) => {
        const service = requireManyfold(reply);
        if (!service) return;

        const { id } = request.params as { id: string };
        const deleted = service.deleteSyncMapping(id);

        if (!deleted) {
            return reply.status(404).send({ error: 'sync_mapping_not_found' });
        }

        return reply.status(204).send();
    });

    /** GET /manyfold/sync/history — Get sync history */
    app.get(`${prefix}/sync/history`, async (request, reply) => {
        const service = requireManyfold(reply);
        if (!service) return;

        const query = request.query as { limit?: string };
        const limit = query.limit ? parseInt(query.limit, 10) : 20;

        const history = service.getSyncHistory(limit);
        return reply.send({ history });
    });

    console.log(`[Manyfold] Routes registered at ${prefix}`);
}
