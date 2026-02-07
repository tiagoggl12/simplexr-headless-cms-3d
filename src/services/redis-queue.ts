import { Queue, Worker, Job } from 'bullmq';

// Job types for the 3D processing pipeline
export type JobType =
  | 'process-glb'
  | 'generate-usdz'
  | 'generate-thumbnail'
  | 'optimize-model'
  | 'ktx2-compress'    // V3: KTX2 texture compression
  | 'lod-generate';     // V3: LOD generation

export interface ProcessGlbJob {
  assetId: string;
  glbUrl: string;
}

export interface GenerateUsdzJob {
  assetId: string;
  glbUrl: string;
}

export interface GenerateThumbnailJob {
  assetId: string;
  glbUrl: string;
  lightingPresetId: string;
}

export interface OptimizeModelJob {
  assetId: string;
  glbUrl: string;
}

/**
 * V3: KTX2 compression job
 */
export interface KTX2CompressJob {
  assetId: string;
  glbUrl: string;
  quality?: number; // 1-10
  formats?: Array<'ktx2' | 'basis'>;
  generateMipmaps?: boolean;
}

/**
 * V3: LOD generation job
 */
export interface LODGenerateJob {
  assetId: string;
  glbUrl: string;
  levels?: Array<{
    level: number;
    ratio: number;
    error: number;
    distance: number;
  }>;
  applyWeld?: boolean;
  applyPrune?: boolean;
}

export class RedisQueueService {
  private queue: Queue;
  private workers: Worker[] = [];

  constructor() {
    const connection = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
    };

    this.queue = new Queue('3d-processing', { connection });
  }

  async enqueue(type: JobType, payload: Record<string, unknown>): Promise<void> {
    const assetId = (payload as { assetId?: string }).assetId || 'unknown';
    await this.queue.add(type, payload, {
      jobId: `${type}-${assetId}-${Date.now()}`,
    });
    console.log(`Enqueued job: ${type}, assetId: ${assetId}`);
  }

  async processGlb(assetId: string, glbUrl: string): Promise<void> {
    await this.enqueue('process-glb', { assetId, glbUrl });
  }

  async generateUsdz(assetId: string, glbUrl: string): Promise<void> {
    await this.enqueue('generate-usdz', { assetId, glbUrl });
  }

  async generateThumbnail(
    assetId: string,
    glbUrl: string,
    lightingPresetId: string
  ): Promise<void> {
    await this.enqueue('generate-thumbnail', {
      assetId,
      glbUrl,
      lightingPresetId,
    });
  }

  async optimizeModel(assetId: string, glbUrl: string): Promise<void> {
    await this.enqueue('optimize-model', { assetId, glbUrl });
  }

  // V3: KTX2 compression
  async compressKTX2(
    assetId: string,
    glbUrl: string,
    options?: {
      quality?: number;
      formats?: Array<'ktx2' | 'basis'>;
      generateMipmaps?: boolean;
    }
  ): Promise<void> {
    await this.enqueue('ktx2-compress', { assetId, glbUrl, ...options });
  }

  // V3: LOD generation
  async generateLODs(
    assetId: string,
    glbUrl: string,
    options?: {
      levels?: Array<{
        level: number;
        ratio: number;
        error: number;
        distance: number;
      }>;
      applyWeld?: boolean;
      applyPrune?: boolean;
    }
  ): Promise<void> {
    await this.enqueue('lod-generate', { assetId, glbUrl, ...options });
  }

  // Start worker with job handlers
  async startWorkers(handlers: {
    onProcessGlb?: (job: any) => Promise<void>;
    onGenerateUsdz?: (job: any) => Promise<void>;
    onGenerateThumbnail?: (job: any) => Promise<void>;
    onOptimizeModel?: (job: any) => Promise<void>;
    // V3 handlers
    onKTX2Compress?: (job: any) => Promise<void>;
    onLODGenerate?: (job: any) => Promise<void>;
  }): Promise<void> {
    const connection = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
    };

    // BullMQ v5: Worker expects (queueName, processor, options)
    // Create a single worker with a router function
    const worker = new Worker(
      '3d-processing',
      async (job: Job) => {
        const { name } = job;
        try {
          switch (name) {
            case 'process-glb':
              if (handlers.onProcessGlb) {
                await handlers.onProcessGlb(job);
              }
              break;
            case 'generate-usdz':
              if (handlers.onGenerateUsdz) {
                await handlers.onGenerateUsdz(job);
              }
              break;
            case 'generate-thumbnail':
              if (handlers.onGenerateThumbnail) {
                await handlers.onGenerateThumbnail(job);
              }
              break;
            case 'optimize-model':
              if (handlers.onOptimizeModel) {
                await handlers.onOptimizeModel(job);
              }
              break;
            // V3 job handlers
            case 'ktx2-compress':
              if (handlers.onKTX2Compress) {
                await handlers.onKTX2Compress(job);
              }
              break;
            case 'lod-generate':
              if (handlers.onLODGenerate) {
                await handlers.onLODGenerate(job);
              }
              break;
            default:
              console.warn(`Unknown job type: ${name}`);
          }
          await job.updateProgress(100);
        } catch (error) {
          console.error(`Job ${name} error:`, error);
          throw error;
        }
      },
      { connection }
    );

    this.workers.push(worker);
  }

  async stopWorkers(): Promise<void> {
    for (const worker of this.workers) {
      await worker.close();
    }
    this.workers = [];
  }

  // Get queue stats
  async getStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  }
}
