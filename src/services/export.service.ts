/**
 * Export Service
 * Handles multi-format export for 3D assets
 */

import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { exec as execCallback } from 'node:child_process';
import type {
  ExportFormat,
  ExportStatus,
  ExportJob,
  ExportOptions,
  ExportFile,
  CreateExportRequest,
  ExportStatistics,
} from '../models/export.js';
import {
  EXPORT_FORMATS,
  getDefaultOptions,
  validateExportOptions,
  estimateProcessingTime,
  getFileExtension,
} from '../models/export.js';

const exec = promisify(execCallback);

/**
 * Export job data
 */
interface ExportJobData {
  id: string;
  assetId: string;
  format: ExportFormat;
  options: ExportOptions;
  status: ExportStatus;
  progress: number;
  resultUrl?: string;
  resultFiles?: ExportFile[];
  fileSize?: number;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  createdBy?: string;
}

/**
 * In-memory export store
 * In production, this would be PostgreSQL
 */
class ExportStore {
  private jobs = new Map<string, ExportJobData>();
  private jobsByAsset = new Map<string, ExportJobData[]>();
  private jobsByStatus = new Map<ExportStatus, ExportJobData[]>();

  createJob(data: Omit<ExportJobData, 'id' | 'createdAt' | 'status' | 'progress'>): ExportJobData {
    const now = new Date().toISOString();
    const id = `export_${randomBytes(16).toString('hex')}`;

    const job: ExportJobData = {
      ...data,
      id,
      status: 'pending',
      progress: 0,
      createdAt: now,
    };

    this.jobs.set(id, job);

    const assetJobs = this.jobsByAsset.get(data.assetId) || [];
    assetJobs.push(job);
    this.jobsByAsset.set(data.assetId, assetJobs);

    const statusJobs = this.jobsByStatus.get('pending') || [];
    statusJobs.push(job);
    this.jobsByStatus.set('pending', statusJobs);

    return job;
  }

  getJob(id: string): ExportJobData | undefined {
    return this.jobs.get(id);
  }

  getJobsByAsset(assetId: string): ExportJobData[] {
    return (this.jobsByAsset.get(assetId) || []).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  getJobsByStatus(status: ExportStatus): ExportJobData[] {
    return this.jobsByStatus.get(status) || [];
  }

  updateJob(id: string, updates: Partial<ExportJobData>): ExportJobData | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;

    const oldStatus = job.status;
    const updated = { ...job, ...updates };

    this.jobs.set(id, updated);

    // Update status index if changed
    if (updates.status && updates.status !== oldStatus) {
      const oldStatusJobs = this.jobsByStatus.get(oldStatus) || [];
      const oldIndex = oldStatusJobs.findIndex(j => j.id === id);
      if (oldIndex !== -1) {
        oldStatusJobs.splice(oldIndex, 1);
        this.jobsByStatus.set(oldStatus, oldStatusJobs);
      }

      const newStatusJobs = this.jobsByStatus.get(updates.status) || [];
      newStatusJobs.push(updated);
      this.jobsByStatus.set(updates.status, newStatusJobs);
    }

    return updated;
  }

  deleteJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;

    this.jobs.delete(id);

    const assetJobs = this.jobsByAsset.get(job.assetId) || [];
    const index = assetJobs.findIndex(j => j.id === id);
    if (index !== -1) {
      assetJobs.splice(index, 1);
    }

    const statusJobs = this.jobsByStatus.get(job.status) || [];
    const statusIndex = statusJobs.findIndex(j => j.id === id);
    if (statusIndex !== -1) {
      statusJobs.splice(statusIndex, 1);
    }

    return true;
  }
}

/**
 * Export Service
 */
export class ExportService {
  private store: ExportStore;
  private processingJobs = new Set<string>();
  private storageBaseUrl: string;

  constructor(storageBaseUrl = 's3://exports') {
    this.store = new ExportStore();
    this.storageBaseUrl = storageBaseUrl;
  }

  /**
   * Get supported export formats
   */
  getSupportedFormats(): ExportFormat[] {
    return Object.keys(EXPORT_FORMATS) as ExportFormat[];
  }

  /**
   * Get format capabilities
   */
  getFormatCapabilities(format: ExportFormat): ReturnType<typeof EXPORT_FORMATS[keyof typeof EXPORT_FORMATS]> | null {
    return EXPORT_FORMATS[format] || null;
  }

  /**
   * Get all format capabilities
   */
  getAllCapabilities(): Record<string, ReturnType<typeof EXPORT_FORMATS[keyof typeof EXPORT_FORMATS]>> {
    return EXPORT_FORMATS;
  }

  /**
   * Create export job
   */
  async createExport(
    assetId: string,
    masterUrl: string,
    request: CreateExportRequest,
    userId?: string
  ): Promise<ExportJob> {
    const options = { ...getDefaultOptions(request.format), ...request.options };

    // Validate options
    const errors = validateExportOptions(request.format, options);
    if (errors.length > 0) {
      const error = new Error(`Invalid export options: ${errors.join(', ')}`);
      (error as any).code = 'INVALID_OPTIONS';
      throw error;
    }

    // Create job
    const job = this.store.createJob({
      assetId,
      format: request.format,
      options,
      createdBy: userId,
    });

    // Start processing asynchronously
    this.processJob(job.id, masterUrl).catch(err => {
      console.error(`[Export] Error processing job ${job.id}:`, err);
    });

    return this.mapToJob(job);
  }

  /**
   * Get export job
   */
  getJob(id: string): ExportJob | null {
    const job = this.store.getJob(id);
    if (!job) return null;
    return this.mapToJob(job);
  }

  /**
   * Get export jobs for an asset
   */
  getAssetExports(assetId: string): ExportJob[] {
    return this.store.getJobsByAsset(assetId).map(j => this.mapToJob(j));
  }

  /**
   * Cancel export job
   */
  async cancelJob(id: string): Promise<boolean> {
    const job = this.store.getJob(id);
    if (!job) return false;

    if (job.status === 'completed' || job.status === 'failed') {
      return false;
    }

    this.store.updateJob(id, { status: 'cancelled' });
    this.processingJobs.delete(id);

    return true;
  }

  /**
   * Delete export job
   */
  deleteJob(id: string): boolean {
    return this.store.deleteJob(id);
  }

  /**
   * Get export statistics
   */
  getStatistics(): ExportStatistics {
    const jobs = Array.from(this.store['jobs'].values());

    const byStatus: Record<ExportStatus, number> = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    const byFormat: Record<string, number> = {};

    let totalProcessingTime = 0;
    let completedCount = 0;

    for (const job of jobs) {
      byStatus[job.status]++;
      byFormat[job.format] = (byFormat[job.format] || 0) + 1;

      if (job.status === 'completed' && job.startedAt && job.completedAt) {
        const duration = new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime();
        totalProcessingTime += duration;
        completedCount++;
      }
    }

    return {
      totalJobs: jobs.length,
      byStatus,
      byFormat: byFormat as Record<ExportFormat, number>,
      avgProcessingTime: completedCount > 0 ? totalProcessingTime / completedCount : 0,
      successRate: completedCount > 0 ? (byStatus.completed / jobs.length) * 100 : 0,
    };
  }

  /**
   * Process export job (internal)
   */
  private async processJob(jobId: string, sourceUrl: string): Promise<void> {
    if (this.processingJobs.has(jobId)) {
      return;
    }

    this.processingJobs.add(jobId);

    try {
      const job = this.store.getJob(jobId);
      if (!job) return;

      // Update to processing
      this.store.updateJob(jobId, {
        status: 'processing',
        startedAt: new Date().toISOString(),
        progress: 10,
      });

      // Simulate processing based on format
      // In production, this would call actual conversion tools
      await this.simulateExport(sourceUrl, job.format, job.options, (progress) => {
        this.store.updateJob(jobId, { progress });
      });

      // Generate result URL
      const resultUrl = `${this.storageBaseUrl}/${job.assetId}/${job.assetId}_${jobId}${getFileExtension(job.format)}`;
      const fileSize = Math.round(Math.random() * 10_000_000) + 100_000; // Simulated file size

      const resultFiles: ExportFile[] = [
        {
          filename: `${job.assetId}${getFileExtension(job.format)}`,
          url: resultUrl,
          size: fileSize,
          mimeType: EXPORT_FORMATS[job.format].mimeType,
        },
      ];

      // Additional files for GLTF
      if (job.format === 'gltf') {
        resultFiles.push({
          filename: `${job.assetId}.bin`,
          url: resultUrl.replace('.gltf', '.bin'),
          size: Math.round(fileSize * 0.8),
          mimeType: 'application/octet-stream',
        });
      }

      // Update to completed
      this.store.updateJob(jobId, {
        status: 'completed',
        progress: 100,
        resultUrl,
        resultFiles,
        fileSize,
        completedAt: new Date().toISOString(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.store.updateJob(jobId, {
        status: 'failed',
        error: errorMessage,
        completedAt: new Date().toISOString(),
      });
    } finally {
      this.processingJobs.delete(jobId);
    }
  }

  /**
   * Simulate export processing (for demo)
   * In production, this would use actual tools like gltf-transform, Blender CLI, etc.
   */
  private async simulateExport(
    sourceUrl: string,
    format: ExportFormat,
    options: ExportOptions,
    onProgress: (progress: number) => void
  ): Promise<void> {
    const steps = 20;
    const delay = 100; // ms

    for (let i = 0; i < steps; i++) {
      await new Promise(resolve => setTimeout(resolve, delay));
      onProgress(10 + Math.round((i / steps) * 80));
    }

    // Simulate format-specific processing
    switch (format) {
      case 'gltf':
      case 'glb':
        // In production: use gltf-transform
        // await gltfTransform(sourceUrl, options);
        break;

      case 'obj':
        // In production: use Blender CLI
        // await blenderExport(sourceUrl, 'obj', options);
        break;

      case 'usdz':
        // In production: use usdcat or xcrun
        // await usdzConvert(sourceUrl, options);
        break;

      case 'stl':
        // In production: use Blender CLI or python
        // await stlExport(sourceUrl, options);
        break;

      case 'fbx':
        // In production: use FBX SDK or Blender
        // await fbxExport(sourceUrl, options);
        break;
    }
  }

  /**
   * Process with gltf-transform (for GLTF/GLB)
   * This is a placeholder for actual implementation
   */
  private async processWithGltfTransform(
    sourceUrl: string,
    format: 'gltf' | 'glb',
    options: ExportOptions
  ): Promise<{ url: string; size: number }> {
    // In production, you would:
    // 1. Download the source file
    // 2. Use @gltf-transform/functions to process
    // 3. Upload to storage
    // 4. Return the URL

    const { Document, NodeIO, WebIO } = await import('@gltf-transform/core');
    // const { draco } = await import('@gltf-transform/extensions');
    // const { resample, prune, dedup } = await import('@gltf-transform/functions');

    // Implementation would go here
    throw new Error('gltf-transform processing not yet implemented');
  }

  /**
   * Process with Blender CLI (for OBJ, STL, FBX)
   * This is a placeholder for actual implementation
   */
  private async processWithBlender(
    sourceUrl: string,
    format: 'obj' | 'stl' | 'fbx',
    options: ExportOptions
  ): Promise<{ url: string; size: number }> {
    // In production, you would:
    // 1. Download the source file
    // 2. Run Blender with Python script
    // 3. Upload result to storage
    // 4. Return the URL

    const blenderPath = process.env.BLENDER_PATH || 'blender';
    const scriptPath = '/path/to/export_script.py';

    // Example command:
    // await exec(`${blenderPath} -b ${sourceUrl} -P ${scriptPath} -- --format ${format} --output ${outputPath}`);

    throw new Error('Blender processing not yet implemented');
  }

  /**
   * Process to USDZ (for iOS AR Quick Look)
   * This is a placeholder for actual implementation
   */
  private async processToUSDZ(
    sourceUrl: string,
    options: ExportOptions
  ): Promise<{ url: string; size: number }> {
    // In production, you would:
    // 1. Download the source file
    // 2. Use usdcat or xcrun to convert
    // 3. Upload result to storage
    // 4. Return the URL

    throw new Error('USDZ processing not yet implemented');
  }

  /**
   * Map internal job to export
   */
  private mapToJob(job: ExportJobData): ExportJob {
    return {
      id: job.id,
      assetId: job.assetId,
      format: job.format,
      options: job.options,
      status: job.status,
      progress: job.progress,
      resultUrl: job.resultUrl,
      resultFiles: job.resultFiles,
      fileSize: job.fileSize,
      error: job.error,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      createdBy: job.createdBy,
    };
  }
}

/**
 * Service singleton
 */
let exportServiceInstance: ExportService | null = null;

export function getExportService(): ExportService {
  if (!exportServiceInstance) {
    exportServiceInstance = new ExportService();
  }
  return exportServiceInstance;
}

export function createExportService(storageBaseUrl?: string): ExportService {
  return new ExportService(storageBaseUrl);
}
