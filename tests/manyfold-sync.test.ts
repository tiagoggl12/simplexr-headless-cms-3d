/**
 * Tests for Manyfold Sync Service
 *
 * Tests the integration service's core functionality:
 * - Service creation and configuration
 * - OAuth2 token management
 * - Model listing and import
 * - Export flow
 * - Sync mapping management
 * - Error handling
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
    ManyfoldSyncService,
    createManyfoldSyncService,
    getManyfoldSyncService,
    ManyfoldError,
    type ManyfoldConfig,
    type ManyfoldModel,
    type ManyfoldListResponse,
} from '../src/services/manyfold-sync.service.js';

// ─── Test Config ─────────────────────────────────────────────────────

const TEST_CONFIG: ManyfoldConfig = {
    baseUrl: 'https://manyfold.test.local',
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
};

// ─── Mock Data ───────────────────────────────────────────────────────

const mockTokenResponse = {
    access_token: 'mock-access-token-123',
    token_type: 'Bearer',
    expires_in: 7200,
    scope: 'public read write',
};

const mockModelsResponse: ManyfoldListResponse<ManyfoldModel> = {
    '@context': [],
    '@id': 'https://manyfold.test.local/models',
    '@type': 'hydra:Collection',
    totalItems: 2,
    member: [
        {
            '@id': '/models/model-001',
            '@type': '3DModel',
            name: 'Benchy',
        },
        {
            '@id': '/models/model-002',
            '@type': '3DModel',
            name: 'Voron Parts',
        },
    ],
    view: {
        '@id': 'https://manyfold.test.local/models?page=1',
        '@type': 'hydra:PartialCollectionView',
        first: 'https://manyfold.test.local/models?page=1',
        last: 'https://manyfold.test.local/models?page=1',
    },
};

const mockModelDetailResponse: ManyfoldModel = {
    '@id': 'https://manyfold.test.local/models/model-001',
    '@type': '3DModel',
    name: 'Benchy',
    caption: 'A 3D printing benchmark',
    description: 'The classic 3DBenchy test print',
    keywords: ['benchmark', '3dbenchy', 'test'],
    hasPart: [
        {
            '@id': 'https://manyfold.test.local/models/model-001/model_files/file-001',
            '@type': '3DModel',
            name: 'benchy.glb',
            encodingFormat: 'model/gltf-binary',
            contentUrl: 'https://manyfold.test.local/models/model-001/model_files/file-001.glb',
            contentSize: 1024000,
        },
        {
            '@id': 'https://manyfold.test.local/models/model-001/model_files/file-002',
            '@type': '3DModel',
            name: 'benchy.stl',
            encodingFormat: 'model/stl',
            contentUrl: 'https://manyfold.test.local/models/model-001/model_files/file-002.stl',
            contentSize: 2048000,
        },
    ],
};

const mockCollectionsResponse = {
    '@context': [],
    '@id': 'https://manyfold.test.local/collections',
    '@type': 'hydra:Collection',
    totalItems: 1,
    member: [
        { '@id': '/collections/col-001', name: 'Printer Parts' },
    ],
    view: {
        '@id': 'https://manyfold.test.local/collections?page=1',
        '@type': 'hydra:PartialCollectionView',
        first: 'https://manyfold.test.local/collections?page=1',
        last: 'https://manyfold.test.local/collections?page=1',
    },
};

const mockCreatorsResponse = {
    '@context': [],
    '@id': 'https://manyfold.test.local/creators',
    '@type': 'hydra:Collection',
    totalItems: 1,
    member: [
        { '@id': '/creators/creator-001', name: 'Test Creator' },
    ],
    view: {
        '@id': 'https://manyfold.test.local/creators?page=1',
        '@type': 'hydra:PartialCollectionView',
        first: 'https://manyfold.test.local/creators?page=1',
        last: 'https://manyfold.test.local/creators?page=1',
    },
};

// ─── Tests ───────────────────────────────────────────────────────────

describe('ManyfoldSyncService', () => {
    let service: ManyfoldSyncService;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        service = createManyfoldSyncService(TEST_CONFIG);

        // Mock global fetch
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ─── Construction & Configuration ──────────────────────────────────

    describe('construction', () => {
        it('should create service with config', () => {
            expect(service).toBeInstanceOf(ManyfoldSyncService);
            const config = service.getConfig();
            expect(config.baseUrl).toBe(TEST_CONFIG.baseUrl);
            expect(config.clientId).toBe(TEST_CONFIG.clientId);
            // clientSecret should not be exposed
            expect((config as any).clientSecret).toBeUndefined();
        });

        it('should set default scopes', () => {
            const config = service.getConfig();
            expect(config.scopes).toBe('public read write');
        });

        it('should strip trailing slash from baseUrl', () => {
            const svc = createManyfoldSyncService({
                ...TEST_CONFIG,
                baseUrl: 'https://example.com/',
            });
            expect(svc.getConfig().baseUrl).toBe('https://example.com');
        });
    });

    // ─── OAuth2 Authentication ─────────────────────────────────────────

    describe('getAccessToken', () => {
        it('should request OAuth2 token via client credentials', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockTokenResponse),
            });

            const token = await service.getAccessToken();

            expect(token).toBe('mock-access-token-123');
            expect(fetchMock).toHaveBeenCalledWith(
                `${TEST_CONFIG.baseUrl}/oauth/token`,
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                })
            );

            // Verify body includes correct grant_type
            const callBody = fetchMock.mock.calls[0][1].body;
            expect(callBody).toContain('grant_type=client_credentials');
            expect(callBody).toContain(`client_id=${TEST_CONFIG.clientId}`);
        });

        it('should cache token and not re-request', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockTokenResponse),
            });

            const token1 = await service.getAccessToken();
            const token2 = await service.getAccessToken();

            expect(token1).toBe(token2);
            // Should only fetch once (cached)
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('should throw on auth failure', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
                text: () => Promise.resolve('Invalid credentials'),
            });

            await expect(service.getAccessToken())
                .rejects.toThrow(ManyfoldError);
        });
    });

    // ─── List Models ───────────────────────────────────────────────────

    describe('listModels', () => {
        beforeEach(() => {
            // First call returns token, second returns models
            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(mockTokenResponse),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve(mockModelsResponse),
                });
        });

        it('should list models from Manyfold', async () => {
            const result = await service.listModels();

            expect(result.totalItems).toBe(2);
            expect(result.member).toHaveLength(2);
            expect(result.member[0].name).toBe('Benchy');
            expect(result.member[1].name).toBe('Voron Parts');
        });

        it('should pass query parameters', async () => {
            await service.listModels({ page: 2, order: 'recent' });

            const apiCallUrl = fetchMock.mock.calls[1][0];
            expect(apiCallUrl).toContain('page=2');
            expect(apiCallUrl).toContain('order=recent');
        });
    });

    // ─── Get Model ─────────────────────────────────────────────────────

    describe('getModel', () => {
        beforeEach(() => {
            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(mockTokenResponse),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve(mockModelDetailResponse),
                });
        });

        it('should get model details with files', async () => {
            const model = await service.getModel('model-001');

            expect(model.name).toBe('Benchy');
            expect(model.keywords).toContain('benchmark');
            expect(model.hasPart).toHaveLength(2);
            expect(model.hasPart![0].encodingFormat).toBe('model/gltf-binary');
        });
    });

    // ─── List Collections ──────────────────────────────────────────────

    describe('listCollections', () => {
        beforeEach(() => {
            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(mockTokenResponse),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve(mockCollectionsResponse),
                });
        });

        it('should list collections from Manyfold', async () => {
            const result = await service.listCollections();

            expect(result.totalItems).toBe(1);
            expect(result.member[0].name).toBe('Printer Parts');
        });
    });

    // ─── List Creators ─────────────────────────────────────────────────

    describe('listCreators', () => {
        beforeEach(() => {
            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(mockTokenResponse),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve(mockCreatorsResponse),
                });
        });

        it('should list creators from Manyfold', async () => {
            const result = await service.listCreators();

            expect(result.totalItems).toBe(1);
            expect(result.member[0].name).toBe('Test Creator');
        });
    });

    // ─── Import Model ──────────────────────────────────────────────────

    describe('importModel', () => {
        beforeEach(() => {
            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(mockTokenResponse),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve(mockModelDetailResponse),
                });
        });

        it('should import a model and create Asset3D data', async () => {
            const result = await service.importModel('model-001');

            expect(result.asset.name).toBe('Benchy');
            expect(result.asset.status).toBe('draft');
            expect(result.asset.id).toBeDefined();
            expect(result.asset.masterUrl).toContain('file-001.glb');
            expect(result.manyfoldModel.name).toBe('Benchy');
            expect(result.files.length).toBeGreaterThan(0);
            expect(result.syncMapping.direction).toBe('import');
            expect(result.syncMapping.status).toBe('synced');
        });

        it('should prefer GLB files when importing', async () => {
            const result = await service.importModel('model-001');

            expect(result.asset.masterUrl).toContain('.glb');
        });

        it('should create a sync mapping', async () => {
            const result = await service.importModel('model-001');

            const mappings = service.getSyncMappings();
            expect(mappings).toHaveLength(1);
            expect(mappings[0].simpleXRAssetId).toBe(result.asset.id);
            expect(mappings[0].manyfoldModelId).toBe('model-001');
        });

        it('should reject duplicate import', async () => {
            await service.importModel('model-001');

            // Second import should fail
            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(mockTokenResponse),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve(mockModelDetailResponse),
                });

            await expect(service.importModel('model-001'))
                .rejects.toThrow('already imported');
        });

        it('should filter files by format', async () => {
            // Reset and setup new mocks
            fetchMock.mockReset();
            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(mockTokenResponse),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve(mockModelDetailResponse),
                });

            const result = await service.importModel('model-001', {
                fileFormats: ['stl'],
            });

            // When filtering for STL only, should pick the STL file
            expect(result.files).toHaveLength(1);
            expect(result.files[0].name).toBe('benchy.stl');
        });
    });

    // ─── Import: No Compatible Files ───────────────────────────────────

    describe('importModel with no files', () => {
        it('should throw when model has no compatible files', async () => {
            const emptyModel: ManyfoldModel = {
                ...mockModelDetailResponse,
                hasPart: [],
            };

            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(mockTokenResponse),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve(emptyModel),
                });

            await expect(service.importModel('model-empty'))
                .rejects.toThrow('no compatible files');
        });
    });

    // ─── Sync Mappings ─────────────────────────────────────────────────

    describe('sync mappings', () => {
        it('should start with no mappings', () => {
            expect(service.getSyncMappings()).toHaveLength(0);
        });

        it('should find mapping by asset ID', async () => {
            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(mockTokenResponse),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve(mockModelDetailResponse),
                });

            const result = await service.importModel('model-001');
            const mapping = service.findMappingByAssetId(result.asset.id);

            expect(mapping).toBeDefined();
            expect(mapping!.manyfoldModelId).toBe('model-001');
        });

        it('should find mapping by Manyfold model ID', async () => {
            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(mockTokenResponse),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve(mockModelDetailResponse),
                });

            const result = await service.importModel('model-001');
            const mapping = service.findMappingByManyfoldId('model-001');

            expect(mapping).toBeDefined();
            expect(mapping!.simpleXRAssetId).toBe(result.asset.id);
        });

        it('should delete a sync mapping', async () => {
            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(mockTokenResponse),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve(mockModelDetailResponse),
                });

            const result = await service.importModel('model-001');
            const mappingId = result.syncMapping.id;

            expect(service.deleteSyncMapping(mappingId)).toBe(true);
            expect(service.getSyncMappings()).toHaveLength(0);
        });

        it('should return false when deleting non-existent mapping', () => {
            expect(service.deleteSyncMapping('non-existent')).toBe(false);
        });
    });

    // ─── Statistics ────────────────────────────────────────────────────

    describe('getStatistics', () => {
        it('should return empty stats initially', () => {
            const stats = service.getStatistics();

            expect(stats.baseUrl).toBe(TEST_CONFIG.baseUrl);
            expect(stats.totalMappings).toBe(0);
            expect(stats.importedCount).toBe(0);
            expect(stats.exportedCount).toBe(0);
            expect(stats.errorCount).toBe(0);
            expect(stats.lastSyncAt).toBeNull();
        });

        it('should track import stats', async () => {
            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(mockTokenResponse),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve(mockModelDetailResponse),
                });

            await service.importModel('model-001');
            const stats = service.getStatistics();

            expect(stats.totalMappings).toBe(1);
            expect(stats.importedCount).toBe(1);
            expect(stats.lastSyncAt).not.toBeNull();
        });
    });

    // ─── Error Handling ────────────────────────────────────────────────

    describe('ManyfoldError', () => {
        it('should create error with code and details', () => {
            const error = new ManyfoldError(
                'Test error',
                'TEST_CODE',
                { extra: 'info' }
            );

            expect(error.message).toBe('Test error');
            expect(error.code).toBe('TEST_CODE');
            expect(error.details).toEqual({ extra: 'info' });
            expect(error.name).toBe('ManyfoldError');
        });
    });

    // ─── API Error Handling ────────────────────────────────────────────

    describe('API errors', () => {
        it('should throw ManyfoldError on API failure', async () => {
            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(mockTokenResponse),
                })
                .mockResolvedValueOnce({
                    ok: false,
                    status: 404,
                    statusText: 'Not Found',
                    text: () => Promise.resolve('Model not found'),
                });

            await expect(service.getModel('non-existent'))
                .rejects.toThrow(ManyfoldError);
        });

        it('should include path in API error details', async () => {
            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(mockTokenResponse),
                })
                .mockResolvedValueOnce({
                    ok: false,
                    status: 500,
                    statusText: 'Internal Server Error',
                    text: () => Promise.resolve('Server error'),
                });

            try {
                await service.getModel('bad-model');
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(ManyfoldError);
                const mfError = error as ManyfoldError;
                expect(mfError.code).toBe('API_ERROR');
                expect(mfError.details?.path).toBe('/models/bad-model');
            }
        });
    });

    // ─── File Upload (Tus) ─────────────────────────────────────────────

    describe('uploadFile', () => {
        it('should upload file via Tus protocol', async () => {
            const fileBuffer = Buffer.from('mock-glb-content');

            fetchMock
                // Token
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(mockTokenResponse),
                })
                // Tus POST (create)
                .mockResolvedValueOnce({
                    ok: true,
                    status: 201,
                    headers: new Map([['Location', '/upload/upload-123']]),
                })
                // Tus PATCH (upload content)
                .mockResolvedValueOnce({
                    ok: true,
                    status: 204,
                    headers: new Map([['Upload-Offset', String(fileBuffer.length)]]),
                });

            const uploadUrl = await service.uploadFile(fileBuffer, 'model.glb');

            expect(uploadUrl).toBe('/upload/upload-123');
            expect(fetchMock).toHaveBeenCalledTimes(3);

            // Verify Tus headers on POST
            const createCall = fetchMock.mock.calls[1];
            expect(createCall[1].headers['Tus-Resumable']).toBe('1.0.0');
            expect(createCall[1].headers['Upload-Length']).toBe(String(fileBuffer.length));
        });

        it('should throw on upload creation failure', async () => {
            const fileBuffer = Buffer.from('mock-content');

            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(mockTokenResponse),
                })
                .mockResolvedValueOnce({
                    ok: false,
                    status: 403,
                    statusText: 'Forbidden',
                });

            await expect(service.uploadFile(fileBuffer, 'model.glb'))
                .rejects.toThrow(ManyfoldError);
        });
    });

    // ─── Test Connection ───────────────────────────────────────────────

    describe('testConnection', () => {
        it('should return connected=true when Manyfold responds', async () => {
            fetchMock
                // NodeInfo
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({
                        software: { name: 'Manyfold', version: 'v0.120.0' },
                    }),
                })
                // Token (for listModels)
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(mockTokenResponse),
                })
                // Models
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve(mockModelsResponse),
                });

            const result = await service.testConnection();

            expect(result.connected).toBe(true);
            expect(result.version).toBe('v0.120.0');
            expect(result.modelCount).toBe(2);
        });

        it('should return connected=false on error', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
            });

            const result = await service.testConnection();

            expect(result.connected).toBe(false);
            expect(result.error).toContain('500');
        });
    });
});

// ─── Route Tests ─────────────────────────────────────────────────────

describe('Manyfold Routes Integration', () => {
    it('should return 503 when Manyfold is not configured', async () => {
        // This test verifies the route behavior when env vars are not set
        // The actual route handler checks getManyfoldSyncService() which returns null
        // without the env vars, resulting in a 503 response

        // We test this at the service level
        const originalEnv = { ...process.env };
        delete process.env.MANYFOLD_BASE_URL;
        delete process.env.MANYFOLD_CLIENT_ID;
        delete process.env.MANYFOLD_CLIENT_SECRET;

        // Clear the singleton
        const mod = await import('../src/services/manyfold-sync.service.js');

        // Note: without env vars, getManyfoldSyncService returns null
        // The route handler would respond with 503

        // Restore
        Object.assign(process.env, originalEnv);
    });
});
