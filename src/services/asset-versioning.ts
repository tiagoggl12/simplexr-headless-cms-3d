import { randomUUID } from 'crypto';
import type { Asset3D } from '../models.js';

/**
 * Asset version snapshot
 */
export interface AssetVersion {
  id: string;
  assetId: string;
  version: number;
  snapshot: Omit<Asset3D, 'id' | 'createdAt' | 'updatedAt'> & {
    originalId: string;
    originalCreatedAt: string;
    originalUpdatedAt: string;
  };
  createdAt: string;
  createdBy?: string; // User or system ID
  changeDescription?: string; // Description of changes
  tags?: string[]; // e.g., 'major', 'minor', 'patch'
}

/**
 * Version comparison result
 */
export interface VersionDiff {
  versionA: number;
  versionB: number;
  changes: {
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }[];
}

/**
 * Rollback options
 */
export interface RollbackOptions {
  createBackup?: boolean; // Create a version before rollback
  changeDescription?: string;
  rollbackReason?: string;
}

/**
 * Versioning configuration
 */
export interface VersioningConfig {
  maxVersions?: number; // Maximum versions to keep per asset (default: 50)
  autoSnapshot?: boolean; // Auto-create version on updates
  snapshotOnStatusChange?: boolean; // Snapshot when status changes
  retainMajorVersions?: number; // Always keep N major versions
}

/**
 * Asset Versioning Service
 *
 * Manages asset version history with rollback capabilities.
 * Tracks all changes to assets over time.
 */
export class AssetVersioningService {
  private versions: Map<string, AssetVersion[]> = new Map();
  private config: Required<VersioningConfig>;

  constructor(config: VersioningConfig = {}) {
    this.config = {
      maxVersions: config.maxVersions ?? 50,
      autoSnapshot: config.autoSnapshot ?? true,
      snapshotOnStatusChange: config.snapshotOnStatusChange ?? true,
      retainMajorVersions: config.retainMajorVersions ?? 10,
    };
  }

  /**
   * Create a version snapshot of an asset
   *
   * @param asset Asset to snapshot
   * @param changeDescription Description of changes
   * @param createdBy User/system creating the version
   * @param tags Version tags
   * @returns Created version
   */
  createVersion(
    asset: Asset3D,
    changeDescription?: string,
    createdBy?: string,
    tags?: string[]
  ): AssetVersion {
    const assetVersions = this.versions.get(asset.id) || [];
    const nextVersion = assetVersions.length + 1;

    const version: AssetVersion = {
      id: randomUUID(),
      assetId: asset.id,
      version: nextVersion,
      snapshot: {
        originalId: asset.id,
        originalCreatedAt: asset.createdAt,
        originalUpdatedAt: asset.updatedAt,
        name: asset.name,
        masterUrl: asset.masterUrl,
        status: asset.status,
        hasMaterialVariants: asset.hasMaterialVariants,
        textureFormats: asset.textureFormats,
        lods: asset.lods,
        processingStatus: asset.processingStatus,
      },
      createdAt: new Date().toISOString(),
      createdBy,
      changeDescription,
      tags,
    };

    assetVersions.push(version);

    // Prune old versions if needed
    this.pruneOldVersions(asset.id, assetVersions);

    this.versions.set(asset.id, assetVersions);

    console.log(
      `[Versioning] Created version ${nextVersion} for asset ${asset.id}` +
      (changeDescription ? `: ${changeDescription}` : '')
    );

    return version;
  }

  /**
   * Get all versions for an asset
   *
   * @param assetId Asset ID
   * @returns Array of versions
   */
  getVersions(assetId: string): AssetVersion[] {
    return this.versions.get(assetId) || [];
  }

  /**
   * Get a specific version
   *
   * @param assetId Asset ID
   * @param version Version number
   * @returns Version or undefined
   */
  getVersion(assetId: string, version: number): AssetVersion | undefined {
    const versions = this.versions.get(assetId);
    return versions?.find(v => v.version === version);
  }

  /**
   * Get the latest version of an asset
   *
   * @param assetId Asset ID
   * @returns Latest version or undefined
   */
  getLatestVersion(assetId: string): AssetVersion | undefined {
    const versions = this.versions.get(assetId);
    if (!versions || versions.length === 0) {
      return undefined;
    }
    return versions[versions.length - 1];
  }

  /**
   * Restore an asset to a previous version
   *
   * @param assetId Asset ID
   * @param version Version to restore
   * @param options Rollback options
   * @returns Restored asset data
   */
  restoreToVersion(
    assetId: string,
    version: number,
    options: RollbackOptions = {}
  ): Omit<Asset3D, 'id' | 'createdAt'> & { updatedAt: string } {
    const versions = this.versions.get(assetId);
    if (!versions) {
      throw new Error(`No versions found for asset ${assetId}`);
    }

    const targetVersion = versions.find(v => v.version === version);
    if (!targetVersion) {
      throw new Error(`Version ${version} not found for asset ${assetId}`);
    }

    console.log(
      `[Versioning] Restoring asset ${assetId} to version ${version}` +
      (options.rollbackReason ? `: ${options.rollbackReason}` : '')
    );

    // Reconstruct asset from snapshot
    const restoredAsset: Omit<Asset3D, 'id' | 'createdAt'> & { updatedAt: string } = {
      name: targetVersion.snapshot.name,
      masterUrl: targetVersion.snapshot.masterUrl,
      status: targetVersion.snapshot.status,
      updatedAt: new Date().toISOString(),
      hasMaterialVariants: targetVersion.snapshot.hasMaterialVariants,
      textureFormats: targetVersion.snapshot.textureFormats,
      lods: targetVersion.snapshot.lods,
      processingStatus: targetVersion.snapshot.processingStatus,
    };

    return restoredAsset;
  }

  /**
   * Compare two versions
   *
   * @param assetId Asset ID
   * @param versionA First version number
   * @param versionB Second version number
   * @returns Comparison result
   */
  compareVersions(assetId: string, versionA: number, versionB: number): VersionDiff {
    const versions = this.versions.get(assetId);
    if (!versions) {
      throw new Error(`No versions found for asset ${assetId}`);
    }

    const vA = versions.find(v => v.version === versionA);
    const vB = versions.find(v => v.version === versionB);

    if (!vA || !vB) {
      throw new Error(`One or both versions not found`);
    }

    const changes: VersionDiff['changes'] = [];
    const snapshotA = vA.snapshot;
    const snapshotB = vB.snapshot;

    // Compare all fields
    const fieldsToCompare: Array<keyof typeof snapshotA> = [
      'name',
      'masterUrl',
      'status',
      'hasMaterialVariants',
    ];

    for (const field of fieldsToCompare) {
      if (snapshotA[field] !== snapshotB[field]) {
        changes.push({
          field,
          oldValue: snapshotA[field],
          newValue: snapshotB[field],
        });
      }
    }

    // Compare complex fields
    if (JSON.stringify(snapshotA.textureFormats) !== JSON.stringify(snapshotB.textureFormats)) {
      changes.push({
        field: 'textureFormats',
        oldValue: snapshotA.textureFormats,
        newValue: snapshotB.textureFormats,
      });
    }

    if (JSON.stringify(snapshotA.lods) !== JSON.stringify(snapshotB.lods)) {
      changes.push({
        field: 'lods',
        oldValue: snapshotA.lods,
        newValue: snapshotB.lods,
      });
    }

    if (JSON.stringify(snapshotA.processingStatus) !== JSON.stringify(snapshotB.processingStatus)) {
      changes.push({
        field: 'processingStatus',
        oldValue: snapshotA.processingStatus,
        newValue: snapshotB.processingStatus,
      });
    }

    return {
      versionA,
      versionB,
      changes,
    };
  }

  /**
   * Delete old versions for an asset
   * Keeps major versions and prunes up to maxVersions
   *
   * @param assetId Asset ID
   * @param versions Versions array (modified in place)
   */
  private pruneOldVersions(assetId: string, versions: AssetVersion[]): void {
    if (versions.length <= this.config.maxVersions) {
      return;
    }

    // Keep major versions (tagged with 'major')
    const majorVersions = versions.filter(v => v.tags?.includes('major'));

    // Keep recent versions within limit
    const versionsToKeep = [
      ...majorVersions.slice(-this.config.retainMajorVersions),
      ...versions.slice(-(this.config.maxVersions - this.config.retainMajorVersions)),
    ];

    // Sort by version number and deduplicate
    const uniqueVersions = Array.from(
      new Map(versionsToKeep.map(v => [v.version, v])).values()
    ).sort((a, b) => a.version - b.version);

    // Update versions array
    versions.length = 0;
    versions.push(...uniqueVersions);

    const deletedCount = versions.length - uniqueVersions.length;
    if (deletedCount > 0) {
      console.log(`[Versioning] Pruned ${deletedCount} old versions for asset ${assetId}`);
    }

    this.versions.set(assetId, versions);
  }

  /**
   * Delete all versions for an asset
   * Called when asset is deleted
   *
   * @param assetId Asset ID
   */
  deleteVersions(assetId: string): void {
    const count = this.versions.get(assetId)?.length || 0;
    this.versions.delete(assetId);
    console.log(`[Versioning] Deleted ${count} version(s) for asset ${assetId}`);
  }

  /**
   * Get versioning statistics
   *
   * @returns Statistics about version storage
   */
  getStatistics(): {
    totalAssets: number;
    totalVersions: number;
    averageVersionsPerAsset: number;
    maxVersionsForAsset: number;
  } {
    const totalAssets = this.versions.size;
    const totalVersions = Array.from(this.versions.values()).reduce((sum, versions) => sum + versions.length, 0);
    const maxVersionsForAsset = Math.max(0, ...Array.from(this.versions.values()).map(v => v.length));

    return {
      totalAssets,
      totalVersions,
      averageVersionsPerAsset: totalAssets > 0 ? totalVersions / totalAssets : 0,
      maxVersionsForAsset,
    };
  }

  /**
   * Auto-snapshot on asset update
   * Called by update operations
   *
   * @param asset Asset before update
   * @param updates Changes being applied
   */
  async autoSnapshot(asset: Asset3D, updates: Partial<Omit<Asset3D, 'id' | 'createdAt'>>): Promise<void> {
    if (!this.config.autoSnapshot) {
      return;
    }

    // Check if we should snapshot based on changes
    const shouldSnapshot =
      this.config.snapshotOnStatusChange && updates.status && updates.status !== asset.status;

    if (shouldSnapshot) {
      const changeDescription = updates.status
        ? `Status changed from ${asset.status} to ${updates.status}`
        : undefined;

      this.createVersion(
        asset,
        changeDescription,
        'system',
        ['auto', updates.status ? 'status-change' : 'update']
      );
    }
  }

  /**
   * Export versions for an asset
   *
   * @param assetId Asset ID
   * @returns JSON export of versions
   */
  exportVersions(assetId: string): string {
    const versions = this.versions.get(assetId) || [];
    return JSON.stringify({
      assetId,
      exportedAt: new Date().toISOString(),
      versionCount: versions.length,
      versions,
    }, null, 2);
  }

  /**
   * Import versions for an asset
   *
   * @param jsonData JSON export data
   * @returns Number of versions imported
   */
  importVersions(jsonData: string): number {
    const data = JSON.parse(jsonData);
    const versions: AssetVersion[] = data.versions;

    if (!Array.isArray(versions)) {
      throw new Error('Invalid import data: versions must be an array');
    }

    const existing = this.versions.get(data.assetId) || [];
    existing.push(...versions);
    this.versions.set(data.assetId, existing);

    console.log(`[Versioning] Imported ${versions.length} version(s) for asset ${data.assetId}`);

    return versions.length;
  }

  /**
   * Update configuration
   *
   * @param updates Configuration updates
   */
  updateConfig(updates: Partial<VersioningConfig>): void {
    Object.assign(this.config, updates);
    console.log('[Versioning] Configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<VersioningConfig> {
    return { ...this.config };
  }
}

/**
 * Create an asset versioning service instance
 */
export function createAssetVersioningService(
  config?: VersioningConfig
): AssetVersioningService {
  return new AssetVersioningService(config);
}
