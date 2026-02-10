import { Job, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { LODGenerator, type LODGenerationOptions } from '../services/lod-generator.js';
import type { LODLevel } from '../models.js';

/**
 * LOD generation job payload
 */
export interface LODGenerationJob {
  assetId: string;
  glbUrl: string;
  options?: LODGenerationOptions;
}

/**
 * LOD generation job result
 */
export interface LODGenerationResult {
  assetId: string;
  originalUrl: string;
  lods: LODLevel[];
  totalSizeReduction: number;
}

/**
 * Worker options
 */
export interface WorkerOptions {
  connection: Redis;
  concurrency?: number;
}

/**
 * LOD Generation Worker
 *
 * Background worker that processes LOD generation jobs.
 * Uses BullMQ for job queue management.
 */
export class LODGenerationWorker {
  private worker: Worker<LODGenerationJob, LODGenerationResult>;
  private generator: LODGenerator;

  constructor(options: WorkerOptions) {
    this.generator = new LODGenerator();

    this.worker = new Worker<LODGenerationJob, LODGenerationResult>(
      'lod-generate',
      async (job: Job<LODGenerationJob>) => {
        return await this.processJob(job);
      },
      {
        connection: options.connection,
        concurrency: options.concurrency ?? 1, // LOD generation is CPU intensive
      }
    );

    this.worker.on('completed', (job, result) => {
      console.log(`[LOD Worker] Job ${job.id} completed for asset ${result.assetId}`);
      console.log(`[LOD Worker] Generated ${result.lods.length} LOD levels`);
      console.log(`[LOD Worker] Size reduction: ${result.totalSizeReduction.toFixed(1)}%`);
    });

    this.worker.on('failed', (job, error) => {
      console.error(`[LOD Worker] Job ${job?.id} failed:`, error);
    });

    this.worker.on('progress', (job, progress) => {
      console.log(`[LOD Worker] Job ${job.id} progress: ${progress}%`);
    });
  }

  /**
   * Process a single LOD generation job
   */
  private async processJob(job: Job<LODGenerationJob>): Promise<LODGenerationResult> {
    const { assetId, glbUrl, options } = job.data;

    console.log(`[LOD Worker] Processing LOD generation for asset ${assetId}`);

    try {
      // Update job progress
      await job.updateProgress(10);

      // Generate LODs
      const result = await this.generator.generateLODs(assetId, glbUrl, options);

      await job.updateProgress(100);

      return result;
    } catch (error) {
      console.error(`[LOD Worker] LOD generation failed for asset ${assetId}:`, error);
      throw error;
    }
  }

  /**
   * Start the worker
   */
  async run(): Promise<void> {
    console.log('[LOD Worker] Starting LOD generation worker...');
    await this.worker.waitUntilReady();
  }

  /**
   * Stop the worker
   */
  async close(): Promise<void> {
    console.log('[LOD Worker] Closing LOD generation worker...');
    await this.worker.close();
  }

  /**
   * Get worker status
   */
  getStatus() {
    return {
      running: this.worker.isRunning(),
      jobCounts: this.worker.name,
    };
  }
}

/**
 * Create and start an LOD generation worker
 */
export async function createLODWorker(
  redis: Redis,
  options?: Partial<WorkerOptions>
): Promise<LODGenerationWorker> {
  const worker = new LODGenerationWorker({
    connection: redis,
    ...options,
  });

  await worker.run();
  return worker;
}
