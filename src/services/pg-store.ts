import { getPool, query, closePool } from '../db.js';
import { Asset3D, AssetStatus, LightingPreset, RenderPreset, MaterialVariant, MaterialVariantStatus } from '../models.js';

interface ListOptions {
  status?: AssetStatus;
  limit?: number;
  offset?: number;
  assetId?: string;
}

// Database row types (snake_case as returned by PostgreSQL)
interface DbAsset3D {
  id: string;
  name: string;
  master_url: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

interface DbLightingPreset {
  id: string;
  name: string;
  hdri_url: string;
  exposure: number;
  intensity: number;
  tags: string[];
  created_at: Date;
  updated_at: Date;
}

interface DbRenderPreset {
  id: string;
  asset_id: string;
  lighting_preset_id: string;
  camera_config: RenderPreset['camera'];
  created_at: Date;
  updated_at: Date;
}

interface DbMaterialVariant {
  id: string;
  asset_id: string;
  name: string;
  base_color: string | null;
  albedo_map_url: string | null;
  normal_map_url: string | null;
  metallic_map_url: string | null;
  roughness_map_url: string | null;
  ao_map_url: string | null;
  emissive_map_url: string | null;
  metallic: number;
  roughness: number;
  status: string;
  created_at: Date;
}

/**
 * Schema SQL for creating all required tables
 * This idempotent schema can be run multiple times safely
 */
export const SCHEMA_SQL = `
-- Drop existing tables if they exist (for clean migration in development)
DROP TABLE IF EXISTS material_variants CASCADE;
DROP TABLE IF EXISTS render_presets CASCADE;
DROP TABLE IF EXISTS lighting_presets CASCADE;
DROP TABLE IF EXISTS assets3d CASCADE;

-- assets3d table
CREATE TABLE IF NOT EXISTS assets3d (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  master_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- lighting_presets table
CREATE TABLE IF NOT EXISTS lighting_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  hdri_url TEXT NOT NULL,
  exposure FLOAT DEFAULT 1.0,
  intensity FLOAT DEFAULT 1.0,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- render_presets table
CREATE TABLE IF NOT EXISTS render_presets (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES assets3d(id) ON DELETE CASCADE,
  lighting_preset_id TEXT NOT NULL REFERENCES lighting_presets(id) ON DELETE CASCADE,
  camera_config JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- material_variants table (NEW for V1/V2)
CREATE TABLE IF NOT EXISTS material_variants (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES assets3d(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  base_color TEXT,
  albedo_map_url TEXT,
  normal_map_url TEXT,
  metallic_map_url TEXT,
  roughness_map_url TEXT,
  ao_map_url TEXT,
  emissive_map_url TEXT,
  metallic FLOAT DEFAULT 0,
  roughness FLOAT DEFAULT 0.5,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_assets3d_status ON assets3d(status);
CREATE INDEX IF NOT EXISTS idx_assets3d_created_at ON assets3d(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lighting_presets_tags ON lighting_presets USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_render_presets_asset_id ON render_presets(asset_id);
CREATE INDEX IF NOT EXISTS idx_material_variants_asset_id ON material_variants(asset_id);
CREATE INDEX IF NOT EXISTS idx_material_variants_status ON material_variants(status);
`;

/**
 * PgStore - PostgreSQL-backed persistence layer
 * Implements the same interface as MemoryStore for drop-in replacement
 */
export class PgStore {
  private initialized = false;

  /**
   * Initialize the database schema
   * This should be called once on application startup
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const pool = getPool();
    await pool.query(SCHEMA_SQL);
    this.initialized = true;
  }

  /**
   * Close database connections
   * Call this when shutting down the application
   */
  async close(): Promise<void> {
    await closePool();
    this.initialized = false;
  }

  // ===== Asset3D CRUD Operations =====

  async createAsset(asset: Asset3D): Promise<Asset3D> {
    const result = await query<DbAsset3D>(
      `INSERT INTO assets3d (id, name, master_url, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [asset.id, asset.name, asset.masterUrl, asset.status, asset.createdAt, asset.updatedAt]
    );
    return this.mapAssetFromDb(result.rows[0]);
  }

  async getAsset(id: string): Promise<Asset3D | null> {
    const result = await query<DbAsset3D>(
      'SELECT * FROM assets3d WHERE id = $1',
      [id]
    );
    return result.rowCount ? this.mapAssetFromDb(result.rows[0]) : null;
  }

  async listAssets(options?: ListOptions): Promise<{
    items: Asset3D[];
    total: number;
    offset: number;
    limit: number;
  }> {
    let sql = 'SELECT * FROM assets3d';
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (options?.status) {
      conditions.push(`status = $${params.length + 1}`);
      params.push(options.status);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY created_at DESC';

    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 100;

    sql += ` OFFSET $${params.length + 1} LIMIT $${params.length + 2}`;
    params.push(offset, limit);

    const result = await query<DbAsset3D>(sql, params);

    // Get total count
    let countSql = 'SELECT COUNT(*) as total FROM assets3d';
    if (conditions.length > 0) {
      countSql += ' WHERE ' + conditions.join(' AND ');
    }
    const countParams = params.slice(0, conditions.length);
    const countResult = await query<{ total: bigint }>(countSql, countParams);

    return {
      items: result.rows.map(row => this.mapAssetFromDb(row)),
      total: Number(countResult.rows[0].total),
      offset,
      limit,
    };
  }

  async updateAsset(
    id: string,
    updates: Partial<Omit<Asset3D, 'id' | 'createdAt'>>
  ): Promise<Asset3D | null> {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      params.push(updates.name);
    }
    if (updates.masterUrl !== undefined) {
      setClauses.push(`master_url = $${paramIndex++}`);
      params.push(updates.masterUrl);
    }
    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      params.push(updates.status);
    }

    if (setClauses.length === 0) return this.getAsset(id);

    // Always update updated_at
    setClauses.push(`updated_at = $${paramIndex++}`);
    params.push(new Date().toISOString());

    params.push(id);

    const result = await query<DbAsset3D>(
      `UPDATE assets3d SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    return result.rowCount ? this.mapAssetFromDb(result.rows[0]) : null;
  }

  async deleteAsset(id: string): Promise<boolean> {
    const result = await query('DELETE FROM assets3d WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  // ===== LightingPreset CRUD Operations =====

  async createLightingPreset(preset: LightingPreset): Promise<LightingPreset> {
    const result = await query<DbLightingPreset>(
      `INSERT INTO lighting_presets (id, name, hdri_url, exposure, intensity, tags, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [preset.id, preset.name, preset.hdriUrl, preset.exposure, preset.intensity, preset.tags, preset.createdAt, preset.updatedAt]
    );
    return this.mapLightingPresetFromDb(result.rows[0]);
  }

  async getLightingPreset(id: string): Promise<LightingPreset | null> {
    const result = await query<DbLightingPreset>(
      'SELECT * FROM lighting_presets WHERE id = $1',
      [id]
    );
    return result.rowCount ? this.mapLightingPresetFromDb(result.rows[0]) : null;
  }

  async listLightingPresets(tag?: string): Promise<LightingPreset[]> {
    let sql = 'SELECT * FROM lighting_presets';
    const params: unknown[] = [];

    if (tag) {
      sql += ' WHERE $1 = ANY(tags)';
      params.push(tag);
    }

    sql += ' ORDER BY created_at DESC';

    const result = await query<DbLightingPreset>(sql, params);
    return result.rows.map(row => this.mapLightingPresetFromDb(row));
  }

  async updateLightingPreset(
    id: string,
    updates: Partial<Omit<LightingPreset, 'id' | 'createdAt'>>
  ): Promise<LightingPreset | null> {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      params.push(updates.name);
    }
    if (updates.hdriUrl !== undefined) {
      setClauses.push(`hdri_url = $${paramIndex++}`);
      params.push(updates.hdriUrl);
    }
    if (updates.exposure !== undefined) {
      setClauses.push(`exposure = $${paramIndex++}`);
      params.push(updates.exposure);
    }
    if (updates.intensity !== undefined) {
      setClauses.push(`intensity = $${paramIndex++}`);
      params.push(updates.intensity);
    }
    if (updates.tags !== undefined) {
      setClauses.push(`tags = $${paramIndex++}`);
      params.push(updates.tags);
    }

    if (setClauses.length === 0) return this.getLightingPreset(id);

    setClauses.push(`updated_at = $${paramIndex++}`);
    params.push(new Date().toISOString());

    params.push(id);

    const result = await query<DbLightingPreset>(
      `UPDATE lighting_presets SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    return result.rowCount ? this.mapLightingPresetFromDb(result.rows[0]) : null;
  }

  async deleteLightingPreset(id: string): Promise<boolean> {
    const result = await query('DELETE FROM lighting_presets WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  // ===== RenderPreset CRUD Operations =====

  async createRenderPreset(preset: RenderPreset): Promise<RenderPreset> {
    const result = await query<DbRenderPreset>(
      `INSERT INTO render_presets (id, asset_id, lighting_preset_id, camera_config, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [preset.id, preset.assetId, preset.lightingPresetId, JSON.stringify(preset.camera), preset.createdAt, preset.updatedAt]
    );
    return this.mapRenderPresetFromDb(result.rows[0]);
  }

  async getRenderPreset(id: string): Promise<RenderPreset | null> {
    const result = await query<DbRenderPreset>(
      'SELECT * FROM render_presets WHERE id = $1',
      [id]
    );
    return result.rowCount ? this.mapRenderPresetFromDb(result.rows[0]) : null;
  }

  async listRenderPresets(options?: { assetId?: string }): Promise<RenderPreset[]> {
    let sql = 'SELECT * FROM render_presets';
    const params: unknown[] = [];

    if (options?.assetId) {
      sql += ' WHERE asset_id = $1';
      params.push(options.assetId);
    }

    sql += ' ORDER BY created_at DESC';

    const result = await query<DbRenderPreset>(sql, params);
    return result.rows.map(row => this.mapRenderPresetFromDb(row));
  }

  async deleteRenderPreset(id: string): Promise<boolean> {
    const result = await query('DELETE FROM render_presets WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  // ===== MaterialVariant CRUD Operations =====

  async createMaterialVariant(variant: MaterialVariant): Promise<MaterialVariant> {
    const result = await query<DbMaterialVariant>(
      `INSERT INTO material_variants (id, asset_id, name, base_color, albedo_map_url, normal_map_url,
       metallic_map_url, roughness_map_url, ao_map_url, emissive_map_url, metallic, roughness, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        variant.id,
        variant.assetId,
        variant.name,
        variant.baseColor ?? null,
        variant.albedoMapUrl ?? null,
        variant.normalMapUrl ?? null,
        variant.metallicMapUrl ?? null,
        variant.roughnessMapUrl ?? null,
        variant.aoMapUrl ?? null,
        variant.emissiveMapUrl ?? null,
        variant.metallic ?? 0,
        variant.roughness ?? 0.5,
        variant.status,
        variant.createdAt,
      ]
    );
    return this.mapMaterialVariantFromDb(result.rows[0]);
  }

  async getMaterialVariant(id: string): Promise<MaterialVariant | null> {
    const result = await query<DbMaterialVariant>(
      'SELECT * FROM material_variants WHERE id = $1',
      [id]
    );
    return result.rowCount ? this.mapMaterialVariantFromDb(result.rows[0]) : null;
  }

  async listMaterialVariants(assetId: string): Promise<MaterialVariant[]> {
    const result = await query<DbMaterialVariant>(
      'SELECT * FROM material_variants WHERE asset_id = $1 ORDER BY created_at DESC',
      [assetId]
    );
    return result.rows.map(row => this.mapMaterialVariantFromDb(row));
  }

  async updateMaterialVariant(
    id: string,
    updates: Partial<Omit<MaterialVariant, 'id' | 'createdAt' | 'assetId'>>
  ): Promise<MaterialVariant | null> {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      params.push(updates.name);
    }
    if (updates.baseColor !== undefined) {
      setClauses.push(`base_color = $${paramIndex++}`);
      params.push(updates.baseColor);
    }
    if (updates.albedoMapUrl !== undefined) {
      setClauses.push(`albedo_map_url = $${paramIndex++}`);
      params.push(updates.albedoMapUrl);
    }
    if (updates.normalMapUrl !== undefined) {
      setClauses.push(`normal_map_url = $${paramIndex++}`);
      params.push(updates.normalMapUrl);
    }
    if (updates.metallicMapUrl !== undefined) {
      setClauses.push(`metallic_map_url = $${paramIndex++}`);
      params.push(updates.metallicMapUrl);
    }
    if (updates.roughnessMapUrl !== undefined) {
      setClauses.push(`roughness_map_url = $${paramIndex++}`);
      params.push(updates.roughnessMapUrl);
    }
    if (updates.aoMapUrl !== undefined) {
      setClauses.push(`ao_map_url = $${paramIndex++}`);
      params.push(updates.aoMapUrl);
    }
    if (updates.emissiveMapUrl !== undefined) {
      setClauses.push(`emissive_map_url = $${paramIndex++}`);
      params.push(updates.emissiveMapUrl);
    }
    if (updates.metallic !== undefined) {
      setClauses.push(`metallic = $${paramIndex++}`);
      params.push(updates.metallic);
    }
    if (updates.roughness !== undefined) {
      setClauses.push(`roughness = $${paramIndex++}`);
      params.push(updates.roughness);
    }
    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      params.push(updates.status);
    }

    if (setClauses.length === 0) return this.getMaterialVariant(id);

    params.push(id);

    const result = await query<DbMaterialVariant>(
      `UPDATE material_variants SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    return result.rowCount ? this.mapMaterialVariantFromDb(result.rows[0]) : null;
  }

  async deleteMaterialVariant(id: string): Promise<boolean> {
    const result = await query('DELETE FROM material_variants WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  // ===== Mapping helpers =====

  private mapAssetFromDb(row: DbAsset3D): Asset3D {
    return {
      id: row.id,
      name: row.name,
      masterUrl: row.master_url,
      status: row.status as AssetStatus,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private mapLightingPresetFromDb(row: DbLightingPreset): LightingPreset {
    return {
      id: row.id,
      name: row.name,
      hdriUrl: row.hdri_url,
      exposure: row.exposure,
      intensity: row.intensity,
      tags: row.tags,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private mapRenderPresetFromDb(row: DbRenderPreset): RenderPreset {
    return {
      id: row.id,
      assetId: row.asset_id,
      lightingPresetId: row.lighting_preset_id,
      camera: row.camera_config,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private mapMaterialVariantFromDb(row: DbMaterialVariant): MaterialVariant {
    return {
      id: row.id,
      assetId: row.asset_id,
      name: row.name,
      baseColor: row.base_color ?? undefined,
      albedoMapUrl: row.albedo_map_url ?? undefined,
      normalMapUrl: row.normal_map_url ?? undefined,
      metallicMapUrl: row.metallic_map_url ?? undefined,
      roughnessMapUrl: row.roughness_map_url ?? undefined,
      aoMapUrl: row.ao_map_url ?? undefined,
      emissiveMapUrl: row.emissive_map_url ?? undefined,
      metallic: row.metallic,
      roughness: row.roughness,
      status: row.status as MaterialVariantStatus,
      createdAt: row.created_at.toISOString(),
    };
  }
}
