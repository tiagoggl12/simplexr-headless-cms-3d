import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp } from '../src/app.js';
import { FastifyInstance } from 'fastify';

describe('GraphQL API', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        // Ensure no DB URL to force in-memory store
        process.env.DATABASE_URL = '';
        app = await createApp();
    });

    afterEach(async () => {
        await app.close();
    });

    it('should return assets via GraphQL', async () => {
        // 1. Create an asset via REST (easier to populate store)
        const createResponse = await app.inject({
            method: 'POST',
            url: '/assets',
            payload: {
                name: 'Test Asset',
                masterUrl: 'http://example.com/asset.glb'
            }
        });
        expect(createResponse.statusCode).toBe(201);
        const assetId = JSON.parse(createResponse.body).id;

        // 2. Query via GraphQL
        const query = `
      query {
        assets {
          id
          name
          status
        }
      }
    `;

        const response = await app.inject({
            method: 'POST',
            url: '/graphql',
            payload: { query }
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.errors).toBeUndefined();
        expect(body.data.assets).toBeDefined();
        expect(body.data.assets.length).toBeGreaterThan(0);
        expect(body.data.assets[0].name).toBe('Test Asset');
        expect(body.data.assets[0].id).toBe(assetId);
    });

    it('should fetch a single asset by ID', async () => {
        // 1. Create an asset
        const createResponse = await app.inject({
            method: 'POST',
            url: '/assets',
            payload: {
                name: 'Single Asset',
                masterUrl: 'http://example.com/single.glb'
            }
        });
        const assetId = JSON.parse(createResponse.body).id;

        // 2. Query
        const query = `
      query GetAsset($id: ID!) {
        asset(id: $id) {
          id
          name
          masterUrl
        }
      }
    `;

        const response = await app.inject({
            method: 'POST',
            url: '/graphql',
            payload: {
                query,
                variables: { id: assetId }
            }
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data.asset).toBeDefined();
        expect(body.data.asset.id).toBe(assetId);
        expect(body.data.asset.name).toBe('Single Asset');
    });

    it('should create an asset via mutation', async () => {
        const mutation = `
      mutation CreateAsset($input: CreateAssetInput!) {
        createAsset(input: $input) {
          id
          name
          status
        }
      }
    `;

        const response = await app.inject({
            method: 'POST',
            url: '/graphql',
            payload: {
                query: mutation,
                variables: {
                    input: {
                        name: 'GraphQL Asset',
                        masterUrl: 'http://example.com/graphql.glb'
                    }
                }
            }
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.errors).toBeUndefined();
        expect(body.data.createAsset.name).toBe('GraphQL Asset');
        expect(body.data.createAsset.status).toBe('draft');
        expect(body.data.createAsset.id).toBeDefined();
    });
});
