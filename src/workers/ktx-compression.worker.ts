import { Job, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { KTX2Processor, type KTX2CompressionOptions } from '../services/ktx-processor.js';
import type { Asset3D } from '../models.js';

/**
 * KTX2 compression job payload
 */
export interface KTX2CompressionJob {
  assetId: string;
  glbUrl: string;
  options?: KTX2CompressionOptions;
}

/**
 * KTX2 compression job result
 */
export interface KTX2CompressionResult {
  assetId: string;
  ktx2Url: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  textureCount: number;
}

/**
 * Worker options
 */
export interface WorkerOptions {
  connection: Redis;
  concurrency?: number;
}

/**
 * KTX2 Compression Worker
 *
 * Background worker that processes KTX2 compression jobs.
 * Uses BullMQ for job queue management.
 */
export class KTX2CompressionWorker {
  private worker: Worker<KTX2CompressionJob, KTX2CompressionResult>;
  private processor: KTX2Processor;

  constructor(options: WorkerOptions) {
    this.processor = new KTX2Processor();

    this.worker = new Worker<KTX2CompressionJob, KTX2CompressionResult>(
      'ktx2-compress',
      async (job: Job<KTX2CompressionJob>) => {
        return await this.processJob(job);
      },
      {
        connection: options.connection,
        concurrency: options.concurrency ?? 2,
      }
    );

    this.worker.on('completed', (job, result) => {
      console.log(`[KTX2 Worker] Job ${job.id} completed for asset ${result.assetId}`);
    });

    this.worker.on('failed', (job, error) => {
      console.error(`[KTX2 Worker] Job ${job?.id} failed:`, error);
    });
  }

  /**
   * Process a single KTX2 compression job
   */
  private async processJob(job: Job<KTX2CompressionJob>): Promise<KTX2CompressionResult> {
    const { assetId, glbUrl, options } = job.data;

    console.log(`[KTX2 Worker] Processing KTX2 compression for asset ${assetId}`);

    try {
      // Perform compression
      const result = await this.processor.compressTextures(glbUrl, options);

      return {
        assetId,
        ktx2Url: result.ktx2Url,
        originalSize: result.originalSize,
        compressedSize: result.compressedSize,
        compressionRatio: result.compressionRatio,
        textureCount: result.textureCount,
      };
    } catch (error) {
      console.error(`[KTX2 Worker] Compression failed for asset ${assetId}:`, error);
      throw error;
    }
  }

  /**
   * Start the worker
   */
  async run(): Promise<void> {
    console.log('[KTX2 Worker] Starting KTX2 compression worker...');
    await this.worker.waitUntilReady();
  }

  /**
   * Stop the worker
   */
  async close(): Promise<void> {
    console.log('[KTX2 Worker] Closing KTX2 compression worker...');
    await this.worker.close();
  }

  /**
   * Get worker status
   */
  getStatus() {
    return {
      running: this.worker.isRunning(),
      jobCounts: this.worker.getName(),
    };
  }
}

/**
 * Create and start a KTX2 compression worker
 */
export async function createKTX2Worker(
  redis: Redis,
  options?: Partial<WorkerOptions>
): Promise<KTX2CompressionWorker> {
  const worker = new KTX2CompressionWorker({
    connection: redis,
    ...options,
  });

  await worker.run();
  return worker;
}
