import { IResolvers } from 'mercurius';
import { randomUUID } from 'crypto';

// We need to define the Context type roughly matching what we pass
// Since Store definition is local to app.ts, we'll use 'any' for now or a partial interface
export interface GraphQLContext {
    store: any; // We'll export Store from app.ts later to fix this
    app: any;
}

const resolvers: IResolvers = {
    Query: {
        // Assets
        async assets(_, { filter, limit, offset }, { store }) {
            // Map GraphQL filter to Store options
            // Store.listAssets takes { status, limit, offset }
            const options: any = {
                limit: limit || 20,
                offset: offset || 0,
            };

            if (filter?.status) {
                options.status = filter.status;
            }

            const result = await store.listAssets(options);
            return result.items;
        },

        async asset(_, { id }, { store }) {
            return store.getAsset(id);
        },

        // Collections (Mock/Stub as Store doesn't seem to have listCollections yet based on app.ts interface)
        // We will implement what is available in the Store interface shown in app.ts
        // app.ts shows: Asset, LightingPreset, RenderPreset, MaterialVariant methods.
        // It does NOT show Collection, Tag, Category, etc. methods explicitly in the interface 
        // but they might be in the underlying PgStore or just missing from the interface wrapper.
        // For now, I will implement what IS in the interface.

        // Taxonomy - Tags/Categories (Stub)
        async tags() { return []; },
        async categories() { return []; },

        // Collections (Stub)
        async collections() { return []; },
    },

    Mutation: {
        async createAsset(_, { input }, { store }) {
            const asset = {
                name: input.name,
                masterUrl: input.masterUrl,
                status: 'draft',
                // In a real app we'd handle tags/categories here too
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                id: randomUUID()
            };

            return store.createAsset(asset);
        },

        async updateAsset(_, { id, input }, { store }) {
            return store.updateAsset(id, input);
        },

        async deleteAsset(_, { id }, { store }) {
            return store.deleteAsset(id);
        },
    },

    Asset3D: {
        async materialVariants(parent, _, { store }) {
            // Check if store has listMaterialVariants
            if (store.listMaterialVariants) {
                return store.listMaterialVariants(parent.id);
            }
            return [];
        },

        async renderPresets(parent, _, { store }) {
            if (store.listRenderPresets) {
                return store.listRenderPresets({ assetId: parent.id });
            }
            return [];
        },

        // Stubs for relations not yet in Store interface
        async tags() { return []; },
        async categories() { return []; },
        async collections() { return []; },
        async customFieldValues() { return []; },
    }
};

export default resolvers;
