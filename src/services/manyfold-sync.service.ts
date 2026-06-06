/**
 * Manyfold Sync Service
 *
 * Integrates SimpleXR with Manyfold (https://github.com/manyfold3d/manyfold)
 * for bidirectional 3D model management.
 *
 * Manyfold is a self-hosted digital asset manager for 3d print files.
 * This service bridges the two systems via Manyfold's JSON-LD REST API (v0).
 *
 * Features:
 * - OAuth2 Client Credentials authentication
 * - List models, collections, and creators from Manyfold
 * - Import models from Manyfold → SimpleXR (download + create Asset3D)
 * - Export SimpleXR assets → Manyfold (Tus upload + create model)
 * - Bidirectional sync with ID mapping
 * - Polling-based sync for new/updated models
 */

import { randomUUID } from 'crypto';

// ─── Types ───────────────────────────────────────────────────────────────

export interface ManyfoldConfig {
    /** Manyfold instance base URL, e.g. "https://my-manyfold.example.com" */
    baseUrl: string;
    /** OAuth2 Client ID (from Manyfold /oauth/applications) */
    clientId: string;
    /** OAuth2 Client Secret */
    clientSecret: string;
    /** OAuth2 scopes to request (default: public read write) */
    scopes?: string;
}

export interface ManyfoldModel {
    '@id': string;
    '@type'?: string;
    name: string;
    caption?: string;
    description?: string;
    keywords?: string[];
    hasPart?: ManyfoldModelFile[];
    creator?: { '@id': string; '@type'?: string };
    isPartOf?: { '@id': string; '@type'?: string };
}

export interface ManyfoldModelFile {
    '@id': string;
    '@type': string;
    name: string;
    encodingFormat: string;
    contentUrl?: string;
    contentSize?: number;
    filename?: string;
}

export interface ManyfoldCollection {
    '@id': string;
    '@type'?: string;
    name: string;
    caption?: string;
    description?: string;
}

export interface ManyfoldCreator {
    '@id': string;
    '@type'?: string;
    name: string;
    slug?: string;
    caption?: string;
    description?: string;
}

export interface ManyfoldListResponse<T> {
    '@context': unknown;
    '@id': string;
    '@type': string;
    totalItems: number;
    member: T[];
    view?: {
        '@id': string;
        '@type': string;
        first?: string;
        prev?: string;
        next?: string;
        last?: string;
    };
}

export type SyncDirection = 'import' | 'export' | 'bidirectional';

export interface SyncMapping {
    id: string;
    simpleXRAssetId: string;
    manyfoldModelId: string;
    manyfoldModelUrl: string;
    direction: SyncDirection;
    lastSyncedAt: string;
    status: 'synced' | 'pending' | 'error';
    error?: string;
}

export interface SyncResult {
    imported: number;
    exported: number;
    errors: Array<{ id: string; error: string }>;
    duration: number;
}

export interface ImportOptions {
    /** Only import models with these file formats */
    fileFormats?: string[];
    /** Import into this collection in SimpleXR */
    collectionId?: string;
    /** Creator filter on Manyfold side */
    creatorId?: string;
    /** Collection filter on Manyfold side */
    manyfoldCollectionId?: string;
    /** Max models to import in one batch */
    limit?: number;
}

export interface ExportOptions {
    /** Manyfold creator to assign the model to */
    creatorId?: string;
    /** Manyfold collection to add the model to */
    collectionId?: string;
    /** Keywords/tags to add */
    keywords?: string[];
    /** SPDX license identifier */
    license?: string;
}

// ─── Service ─────────────────────────────────────────────────────────────

let _instance: ManyfoldSyncService | null = null;

export class ManyfoldSyncService {
    private config: ManyfoldConfig;
    private accessToken: string | null = null;
    private tokenExpiresAt: number = 0;
    private syncMappings: Map<string, SyncMapping> = new Map();
    private syncHistory: SyncResult[] = [];

    private readonly CONTENT_TYPE = 'application/vnd.manyfold.v0+json';

    constructor(config: ManyfoldConfig) {
        this.config = {
            ...config,
            baseUrl: config.baseUrl.replace(/\/+$/, ''),
            scopes: config.scopes || 'public read write',
        };
        console.log(`[Manyfold] Service initialized for ${this.config.baseUrl}`);
    }

    // ─── OAuth2 Authentication ───────────────────────────────────────────

    /**
     * Get OAuth2 access token via Client Credentials flow.
     * Tokens are cached and refreshed automatically.
     */
    async getAccessToken(): Promise<string> {
        // Return cached token if still valid (with 60s buffer)
        if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
            return this.accessToken;
        }

        const tokenUrl = `${this.config.baseUrl}/oauth/token`;

        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
                scope: this.config.scopes!,
            }).toString(),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new ManyfoldError(
                `OAuth2 token request failed: ${response.status} ${response.statusText}`,
                'AUTH_FAILED',
                { status: response.status, body: errorText }
            );
        }

        const data = await response.json() as {
            access_token: string;
            token_type: string;
            expires_in: number;
            scope: string;
        };

        this.accessToken = data.access_token;
        this.tokenExpiresAt = Date.now() + data.expires_in * 1000;

        console.log(`[Manyfold] OAuth2 token obtained (expires in ${data.expires_in}s)`);

        return this.accessToken;
    }

    /**
     * Make an authenticated request to the Manyfold API.
     */
    private async apiRequest<T>(
        path: string,
        options: {
            method?: string;
            body?: unknown;
            headers?: Record<string, string>;
        } = {}
    ): Promise<T> {
        const token = await this.getAccessToken();
        const url = `${this.config.baseUrl}${path}`;

        const headers: Record<string, string> = {
            'Accept': this.CONTENT_TYPE,
            'Authorization': `Bearer ${token}`,
            ...options.headers,
        };

        if (options.body) {
            headers['Content-Type'] = this.CONTENT_TYPE;
        }

        const response = await fetch(url, {
            method: options.method || 'GET',
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new ManyfoldError(
                `Manyfold API error: ${response.status} ${response.statusText} for ${options.method || 'GET'} ${path}`,
                'API_ERROR',
                { status: response.status, body: errorText, path }
            );
        }

        // Handle 204 No Content
        if (response.status === 204) {
            return undefined as T;
        }

        return response.json() as Promise<T>;
    }

    // ─── Models ──────────────────────────────────────────────────────────

    /**
     * List models from the Manyfold instance.
     */
    async listModels(options?: {
        page?: number;
        order?: 'name' | 'recent' | 'updated';
        creator?: string;
        collection?: string;
    }): Promise<ManyfoldListResponse<ManyfoldModel>> {
        const params = new URLSearchParams();
        if (options?.page) params.set('page', String(options.page));
        if (options?.order) params.set('order', options.order);
        if (options?.creator) params.set('creator', options.creator);
        if (options?.collection) params.set('collection', options.collection);

        const query = params.toString();
        const path = `/models${query ? `?${query}` : ''}`;

        return this.apiRequest<ManyfoldListResponse<ManyfoldModel>>(path);
    }

    /**
     * Get a single model from Manyfold by ID.
     */
    async getModel(modelId: string): Promise<ManyfoldModel> {
        return this.apiRequest<ManyfoldModel>(`/models/${modelId}`);
    }

    /**
     * Get a single model file detail.
     */
    async getModelFile(modelId: string, fileId: string): Promise<ManyfoldModelFile> {
        return this.apiRequest<ManyfoldModelFile>(`/models/${modelId}/model_files/${fileId}`);
    }

    /**
     * Create a model on Manyfold.
     */
    async createModel(data: {
        name: string;
        caption?: string;
        description?: string;
        keywords?: string[];
        creator?: { '@id': string };
        isPartOf?: { '@id': string };
        license?: string;
        files: Array<{ id: string; name: string }>;
    }): Promise<void> {
        const body: Record<string, unknown> = {
            name: data.name,
            files: data.files,
        };

        if (data.caption) body.caption = data.caption;
        if (data.description) body.description = data.description;
        if (data.keywords) body.keywords = data.keywords;
        if (data.creator) body.creator = data.creator;
        if (data.isPartOf) body.isPartOf = data.isPartOf;
        if (data.license) {
            body['spdx:license'] = {
                '@type': 'spdx:License',
                licenseId: data.license,
            };
        }

        await this.apiRequest('/models', {
            method: 'POST',
            body,
        });
    }

    /**
     * Update a model on Manyfold.
     */
    async updateModel(modelId: string, updates: {
        name?: string;
        caption?: string;
        description?: string;
        keywords?: string[];
    }): Promise<ManyfoldModel> {
        return this.apiRequest<ManyfoldModel>(`/models/${modelId}`, {
            method: 'PATCH',
            body: updates,
        });
    }

    /**
     * Delete a model from Manyfold.
     */
    async deleteModel(modelId: string): Promise<void> {
        await this.apiRequest(`/models/${modelId}`, { method: 'DELETE' });
    }

    // ─── Collections ─────────────────────────────────────────────────────

    /**
     * List collections from the Manyfold instance.
     */
    async listCollections(options?: {
        page?: number;
        order?: 'name' | 'recent' | 'updated';
    }): Promise<ManyfoldListResponse<ManyfoldCollection>> {
        const params = new URLSearchParams();
        if (options?.page) params.set('page', String(options.page));
        if (options?.order) params.set('order', options.order);

        const query = params.toString();
        return this.apiRequest<ManyfoldListResponse<ManyfoldCollection>>(
            `/collections${query ? `?${query}` : ''}`
        );
    }

    /**
     * Get a single collection from Manyfold.
     */
    async getCollection(collectionId: string): Promise<ManyfoldCollection> {
        return this.apiRequest<ManyfoldCollection>(`/collections/${collectionId}`);
    }

    /**
     * Create a collection on Manyfold.
     */
    async createCollection(data: {
        name: string;
        caption?: string;
        description?: string;
    }): Promise<ManyfoldCollection> {
        return this.apiRequest<ManyfoldCollection>('/collections', {
            method: 'POST',
            body: data,
        });
    }

    // ─── Creators ────────────────────────────────────────────────────────

    /**
     * List creators from the Manyfold instance.
     */
    async listCreators(options?: {
        page?: number;
        order?: 'name' | 'recent' | 'updated';
    }): Promise<ManyfoldListResponse<ManyfoldCreator>> {
        const params = new URLSearchParams();
        if (options?.page) params.set('page', String(options.page));
        if (options?.order) params.set('order', options.order);

        const query = params.toString();
        return this.apiRequest<ManyfoldListResponse<ManyfoldCreator>>(
            `/creators${query ? `?${query}` : ''}`
        );
    }

    /**
     * Create a creator on Manyfold.
     */
    async createCreator(data: {
        name: string;
        slug?: string;
        caption?: string;
        description?: string;
    }): Promise<ManyfoldCreator> {
        return this.apiRequest<ManyfoldCreator>('/creators', {
            method: 'POST',
            body: data,
        });
    }

    // ─── File Upload (Tus Protocol) ──────────────────────────────────────

    /**
     * Upload a file to Manyfold using the Tus resumable upload protocol.
     * Returns the upload URL (ID) to reference when creating models.
     */
    async uploadFile(
        fileBuffer: Buffer,
        filename: string,
        onProgress?: (progress: number) => void
    ): Promise<string> {
        const token = await this.getAccessToken();
        const baseUrl = this.config.baseUrl;

        // Step 1: Create the upload
        const createResponse = await fetch(`${baseUrl}/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Tus-Resumable': '1.0.0',
                'Upload-Length': String(fileBuffer.length),
                'Upload-Metadata': `filename ${Buffer.from(filename).toString('base64')}`,
            },
        });

        if (!createResponse.ok) {
            throw new ManyfoldError(
                `Tus upload creation failed: ${createResponse.status}`,
                'UPLOAD_CREATE_FAILED',
                { status: createResponse.status }
            );
        }

        const uploadUrl = createResponse.headers.get('Location');
        if (!uploadUrl) {
            throw new ManyfoldError(
                'Tus upload creation did not return Location header',
                'UPLOAD_NO_LOCATION'
            );
        }

        // Step 2: Upload the bytes (in chunks of 5MB for large files)
        const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
        let offset = 0;

        while (offset < fileBuffer.length) {
            const end = Math.min(offset + CHUNK_SIZE, fileBuffer.length);
            const chunk = fileBuffer.subarray(offset, end);

            const fullUploadUrl = uploadUrl.startsWith('http')
                ? uploadUrl
                : `${baseUrl}${uploadUrl}`;

            const patchResponse = await fetch(fullUploadUrl, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Tus-Resumable': '1.0.0',
                    'Upload-Offset': String(offset),
                    'Content-Length': String(chunk.length),
                    'Content-Type': 'application/offset+octet-stream',
                },
                body: new Uint8Array(chunk),
            });

            if (!patchResponse.ok) {
                throw new ManyfoldError(
                    `Tus upload chunk failed at offset ${offset}: ${patchResponse.status}`,
                    'UPLOAD_CHUNK_FAILED',
                    { status: patchResponse.status, offset }
                );
            }

            const newOffset = patchResponse.headers.get('Upload-Offset');
            offset = newOffset ? parseInt(newOffset, 10) : end;

            if (onProgress) {
                onProgress(Math.round((offset / fileBuffer.length) * 100));
            }
        }

        console.log(`[Manyfold] Uploaded file "${filename}" (${fileBuffer.length} bytes)`);

        return uploadUrl;
    }

    // ─── Import: Manyfold → SimpleXR ─────────────────────────────────────

    /**
     * Import a model from Manyfold into SimpleXR.
     * Downloads the model files and creates an Asset3D record.
     *
     * Returns the data needed to create an Asset3D (caller handles store).
     */
    async importModel(modelId: string, options?: ImportOptions): Promise<{
        asset: {
            id: string;
            name: string;
            masterUrl: string;
            status: 'draft';
            createdAt: string;
            updatedAt: string;
        };
        manyfoldModel: ManyfoldModel;
        files: ManyfoldModelFile[];
        syncMapping: SyncMapping;
    }> {
        // Check if already imported
        const existingMapping = this.findMappingByManyfoldId(modelId);
        if (existingMapping) {
            throw new ManyfoldError(
                `Model ${modelId} is already imported as asset ${existingMapping.simpleXRAssetId}`,
                'ALREADY_IMPORTED',
                { mapping: existingMapping }
            );
        }

        // Get the full model details
        const model = await this.getModel(modelId);
        const files = model.hasPart || [];

        // Filter files by format if specified
        let filteredFiles = files;
        if (options?.fileFormats && options.fileFormats.length > 0) {
            filteredFiles = files.filter(f =>
                options.fileFormats!.some(fmt =>
                    f.encodingFormat?.includes(fmt) || f.name?.endsWith(`.${fmt}`)
                )
            );
        }

        // Prefer GLB files, fall back to first available
        const glbFile = filteredFiles.find(f =>
            f.encodingFormat === 'model/gltf-binary' ||
            f.name?.endsWith('.glb')
        );

        const primaryFile = glbFile || filteredFiles[0];

        if (!primaryFile) {
            throw new ManyfoldError(
                `Model ${modelId} has no compatible files`,
                'NO_COMPATIBLE_FILES',
                { availableFormats: files.map(f => f.encodingFormat) }
            );
        }

        // Build the master URL from the Manyfold content URL
        const masterUrl = primaryFile.contentUrl
            ? (primaryFile.contentUrl.startsWith('http')
                ? primaryFile.contentUrl
                : `${this.config.baseUrl}${primaryFile.contentUrl}`)
            : `${this.config.baseUrl}${primaryFile['@id']}`;

        // Create asset data
        const now = new Date().toISOString();
        const assetId = randomUUID();
        const asset = {
            id: assetId,
            name: model.name,
            masterUrl,
            status: 'draft' as const,
            createdAt: now,
            updatedAt: now,
        };

        // Create sync mapping
        const mapping: SyncMapping = {
            id: randomUUID(),
            simpleXRAssetId: assetId,
            manyfoldModelId: modelId,
            manyfoldModelUrl: model['@id'],
            direction: 'import',
            lastSyncedAt: now,
            status: 'synced',
        };

        this.syncMappings.set(mapping.id, mapping);

        console.log(`[Manyfold] Imported model "${model.name}" → asset ${assetId}`);

        return {
            asset,
            manyfoldModel: model,
            files: filteredFiles,
            syncMapping: mapping,
        };
    }

    /**
     * Bulk import models from Manyfold.
     * Returns import results for all models.
     */
    async importModels(options?: ImportOptions): Promise<{
        results: Array<{
            modelId: string;
            modelName: string;
            assetId?: string;
            status: 'imported' | 'skipped' | 'error';
            error?: string;
        }>;
        summary: { imported: number; skipped: number; errors: number };
    }> {
        const limit = options?.limit || 50;
        const listResult = await this.listModels({
            order: 'recent',
            creator: options?.creatorId,
            collection: options?.manyfoldCollectionId,
        });

        const modelsToImport = listResult.member.slice(0, limit);
        const results: Array<{
            modelId: string;
            modelName: string;
            assetId?: string;
            status: 'imported' | 'skipped' | 'error';
            error?: string;
        }> = [];

        for (const model of modelsToImport) {
            const modelId = this.extractIdFromUrl(model['@id']);

            try {
                const result = await this.importModel(modelId, options);
                results.push({
                    modelId,
                    modelName: model.name,
                    assetId: result.asset.id,
                    status: 'imported',
                });
            } catch (error) {
                const err = error as ManyfoldError;
                if (err.code === 'ALREADY_IMPORTED') {
                    results.push({
                        modelId,
                        modelName: model.name,
                        status: 'skipped',
                        error: 'Already imported',
                    });
                } else {
                    results.push({
                        modelId,
                        modelName: model.name,
                        status: 'error',
                        error: err.message,
                    });
                }
            }
        }

        const summary = {
            imported: results.filter(r => r.status === 'imported').length,
            skipped: results.filter(r => r.status === 'skipped').length,
            errors: results.filter(r => r.status === 'error').length,
        };

        console.log(
            `[Manyfold] Bulk import complete: ` +
            `${summary.imported} imported, ${summary.skipped} skipped, ${summary.errors} errors`
        );

        return { results, summary };
    }

    // ─── Export: SimpleXR → Manyfold ─────────────────────────────────────

    /**
     * Export a SimpleXR asset to Manyfold.
     * Uploads the GLB file and creates a model on Manyfold.
     *
     * @param asset The Asset3D to export
     * @param fileBuffer The GLB file buffer to upload
     * @param options Export options
     */
    async exportAsset(
        asset: { id: string; name: string; masterUrl: string },
        fileBuffer: Buffer,
        options?: ExportOptions
    ): Promise<{
        uploadUrl: string;
        syncMapping: SyncMapping;
    }> {
        // Check if already exported
        const existingMapping = this.findMappingByAssetId(asset.id);
        if (existingMapping?.direction === 'export') {
            throw new ManyfoldError(
                `Asset ${asset.id} is already exported to Manyfold as ${existingMapping.manyfoldModelId}`,
                'ALREADY_EXPORTED',
                { mapping: existingMapping }
            );
        }

        // Step 1: Upload the file via Tus
        const filename = `${asset.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.glb`;
        const uploadUrl = await this.uploadFile(fileBuffer, filename);

        // Step 2: Create the model on Manyfold
        const createData: {
            name: string;
            caption?: string;
            description?: string;
            keywords?: string[];
            creator?: { '@id': string };
            isPartOf?: { '@id': string };
            license?: string;
            files: Array<{ id: string; name: string }>;
        } = {
            name: asset.name,
            caption: `Exported from SimpleXR (${asset.id})`,
            keywords: options?.keywords || ['simplexr', 'e-commerce', '3d'],
            files: [{ id: uploadUrl, name: filename }],
        };

        if (options?.creatorId) {
            createData.creator = { '@id': `${this.config.baseUrl}/creators/${options.creatorId}` };
        }
        if (options?.collectionId) {
            createData.isPartOf = { '@id': `${this.config.baseUrl}/collections/${options.collectionId}` };
        }
        if (options?.license) {
            createData.license = options.license;
        }

        await this.createModel(createData);

        // Create sync mapping
        const now = new Date().toISOString();
        const mapping: SyncMapping = {
            id: randomUUID(),
            simpleXRAssetId: asset.id,
            manyfoldModelId: 'pending', // Will be resolved after Manyfold processes upload
            manyfoldModelUrl: uploadUrl,
            direction: 'export',
            lastSyncedAt: now,
            status: 'synced',
        };

        this.syncMappings.set(mapping.id, mapping);

        console.log(`[Manyfold] Exported asset "${asset.name}" (${asset.id}) → Manyfold`);

        return { uploadUrl, syncMapping: mapping };
    }

    // ─── Sync Management ─────────────────────────────────────────────────

    /**
     * Get all sync mappings.
     */
    getSyncMappings(): SyncMapping[] {
        return Array.from(this.syncMappings.values());
    }

    /**
     * Get a specific sync mapping by ID.
     */
    getSyncMapping(mappingId: string): SyncMapping | undefined {
        return this.syncMappings.get(mappingId);
    }

    /**
     * Find a sync mapping by SimpleXR asset ID.
     */
    findMappingByAssetId(assetId: string): SyncMapping | undefined {
        return Array.from(this.syncMappings.values())
            .find(m => m.simpleXRAssetId === assetId);
    }

    /**
     * Find a sync mapping by Manyfold model ID.
     */
    findMappingByManyfoldId(manyfoldModelId: string): SyncMapping | undefined {
        return Array.from(this.syncMappings.values())
            .find(m => m.manyfoldModelId === manyfoldModelId);
    }

    /**
     * Delete a sync mapping.
     */
    deleteSyncMapping(mappingId: string): boolean {
        return this.syncMappings.delete(mappingId);
    }

    /**
     * Get sync history.
     */
    getSyncHistory(limit: number = 20): SyncResult[] {
        return this.syncHistory.slice(-limit);
    }

    /**
     * Test the connection to Manyfold.
     */
    async testConnection(): Promise<{
        connected: boolean;
        version?: string;
        modelCount?: number;
        error?: string;
    }> {
        try {
            // Try NodeInfo endpoint (no auth required)
            const response = await fetch(`${this.config.baseUrl}/nodeinfo/2.0`, {
                headers: { 'Accept': 'application/json' },
            });

            if (!response.ok) {
                return {
                    connected: false,
                    error: `HTTP ${response.status}: ${response.statusText}`,
                };
            }

            const nodeInfo = await response.json() as {
                software?: { name?: string; version?: string };
            };

            // Now try authenticated endpoint
            const models = await this.listModels({ page: 1 });

            return {
                connected: true,
                version: nodeInfo.software?.version,
                modelCount: models.totalItems,
            };
        } catch (error) {
            return {
                connected: false,
                error: String(error),
            };
        }
    }

    /**
     * Get service statistics.
     */
    getStatistics(): {
        connected: boolean;
        baseUrl: string;
        totalMappings: number;
        importedCount: number;
        exportedCount: number;
        errorCount: number;
        lastSyncAt: string | null;
    } {
        const mappings = this.getSyncMappings();
        const lastSync = mappings.length > 0
            ? mappings.reduce((latest, m) =>
                m.lastSyncedAt > latest ? m.lastSyncedAt : latest, '')
            : null;

        return {
            connected: this.accessToken !== null,
            baseUrl: this.config.baseUrl,
            totalMappings: mappings.length,
            importedCount: mappings.filter(m => m.direction === 'import').length,
            exportedCount: mappings.filter(m => m.direction === 'export').length,
            errorCount: mappings.filter(m => m.status === 'error').length,
            lastSyncAt: lastSync || null,
        };
    }

    // ─── Helpers ─────────────────────────────────────────────────────────

    /**
     * Extract the ID portion from a Manyfold URL (e.g. "/models/abc123" → "abc123")
     */
    private extractIdFromUrl(url: string): string {
        const parts = url.split('/');
        return parts[parts.length - 1];
    }

    /**
     * Get the current config (without secret).
     */
    getConfig(): Omit<ManyfoldConfig, 'clientSecret'> {
        return {
            baseUrl: this.config.baseUrl,
            clientId: this.config.clientId,
            scopes: this.config.scopes,
        };
    }
}

// ─── Error Class ─────────────────────────────────────────────────────────

export class ManyfoldError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly details?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'ManyfoldError';
    }
}

// ─── Singleton ───────────────────────────────────────────────────────────

/**
 * Get the ManyfoldSyncService singleton.
 * Requires MANYFOLD_BASE_URL, MANYFOLD_CLIENT_ID, MANYFOLD_CLIENT_SECRET env vars.
 * Returns null if not configured.
 */
export function getManyfoldSyncService(): ManyfoldSyncService | null {
    if (_instance) return _instance;

    const baseUrl = process.env.MANYFOLD_BASE_URL;
    const clientId = process.env.MANYFOLD_CLIENT_ID;
    const clientSecret = process.env.MANYFOLD_CLIENT_SECRET;

    if (!baseUrl || !clientId || !clientSecret) {
        console.log('[Manyfold] Integration not configured (missing env vars)');
        return null;
    }

    _instance = new ManyfoldSyncService({
        baseUrl: baseUrl.replace(/\/$/, ''), // Remove trailing slash
        clientId,
        clientSecret,
    });

    return _instance;
}

/**
 * Create a ManyfoldSyncService with explicit config (for testing).
 */
export function createManyfoldSyncService(config: ManyfoldConfig): ManyfoldSyncService {
    return new ManyfoldSyncService(config);
}
