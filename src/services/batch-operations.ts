import { randomUUID } from 'crypto';
import type { Asset3D, AssetStatus } from '../models.js';

/**
 * Batch operation status
 */
export type BatchOperationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Batch operation type
 */
export type BatchOperationType = 'upload' | 'delete' | 'update' | 'process' | 'export';

/**
 * Batch job item
 */
export interface BatchJobItem<T = unknown> {
  id: string;
  data: T;
  status: 'pending' | 'completed' | 'failed';
  error?: string;
  result?: unknown;
  startedAt?: string;
  completedAt?: string;
}

/**
 * Batch operation
 */
export interface BatchOperation<T = unknown> {
  id: string;
  type: BatchOperationType;
  status: BatchOperationStatus;
  items: BatchJobItem<T>[];
  totalItems: number;
  completedItems: number;
  failedItems: number;
  createdBy?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  progress: number; // 0-100
  options?: BatchOperationOptions;
}

/**
 * Batch operation options
 */
export interface BatchOperationOptions {
  continueOnError?: boolean; // Continue processing even if some items fail
  maxConcurrent?: number; // Maximum concurrent operations
  chunkSize?: number; // Process items in chunks
  notifyOnComplete?: boolean; // Send notification when complete
  notificationWebhook?: string; // Webhook URL for notifications
}

/**
 * Batch upload item
 */
export interface BatchUploadItem {
  name: string;
  masterUrl: string;
  status?: AssetStatus;
}

/**
 * Batch update item
 */
export interface BatchUpdateItem {
  assetId: string;
  updates: Partial<Omit<Asset3D, 'id' | 'createdAt'>>;
}

/**
 * Batch delete item
 */
export interface BatchDeleteItem {
  assetId: string;
}

/**
 * Batch result
 */
export interface BatchResult<T = unknown> {
  operationId: string;
  type: BatchOperationType;
  status: BatchOperationStatus;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  results: Array<{
    id: string;
    status: 'completed' | 'failed';
    data?: T;
    error?: string;
  }>;
  summary: {
    duration: number; // milliseconds
    averageTimePerItem: number;
    successRate: number; // 0-100
  };
}

/**
 * Callback type for batch operations
 */
type BatchCallback<T, R> = (item: T, index: number) => Promise<R>;

/**
 * Batch Operations Service
 *
 * Handles batch operations for assets (upload, delete, update).
 * Provides progress tracking and error handling.
 */
export class BatchOperationsService {
  private operations: Map<string, BatchOperation> = new Map();
  private activeJobs: Map<string, Promise<void>> = new Map();

  /**
   * Create a new batch operation
   *
   * @param type Operation type
   * @param items Items to process
   * @param options Operation options
   * @param createdBy Creator ID
   * @returns Created batch operation
   */
  createOperation<T>(
    type: BatchOperationType,
    items: T[],
    options?: BatchOperationOptions,
    createdBy?: string
  ): BatchOperation<T> {
    const operationId = randomUUID();

    const jobItems: BatchJobItem<T>[] = items.map((data) => ({
      id: randomUUID(),
      data,
      status: 'pending',
    }));

    const operation: BatchOperation<T> = {
      id: operationId,
      type,
      status: 'pending',
      items: jobItems,
      totalItems: items.length,
      completedItems: 0,
      failedItems: 0,
      createdBy,
      createdAt: new Date().toISOString(),
      progress: 0,
      options,
    };

    this.operations.set(operationId, operation);

    console.log(
      `[Batch] Created ${type} operation ${operationId} with ${items.length} item(s)`
    );

    return operation;
  }

  /**
   * Execute a batch operation
   *
   * @param operationId Operation ID
   * @param callback Callback function for each item
   * @returns Promise that resolves when operation completes
   */
  async executeOperation<T, R>(
    operationId: string,
    callback: BatchCallback<T, R>
  ): Promise<BatchResult<R>> {
    const operation = this.operations.get(operationId);
    if (!operation) {
      throw new Error(`Operation ${operationId} not found`);
    }

    if (operation.status === 'running') {
      throw new Error(`Operation ${operationId} is already running`);
    }

    operation.status = 'running';
    operation.startedAt = new Date().toISOString();

    const startTime = Date.now();
    const results: Array<{
      id: string;
      status: 'completed' | 'failed';
      data?: R;
      error?: string;
    }> = [];

    const options = operation.options || {};
    const continueOnError = options.continueOnError ?? true;
    const maxConcurrent = options.maxConcurrent ?? 5;

    console.log(`[Batch] Starting operation ${operationId} with ${maxConcurrent} concurrent workers`);

    // Process items in batches
    const processBatch = async (items: BatchJobItem<T>[]): Promise<void> => {
      for (const item of items) {
        if (operation.status === 'cancelled') {
          console.log(`[Batch] Operation ${operationId} was cancelled`);
          break;
        }

        item.status = 'pending';
        item.startedAt = new Date().toISOString();

        try {
          const result = await callback(item.data as T, operation.items.indexOf(item));
          item.status = 'completed';
          item.result = result;
          item.completedAt = new Date().toISOString();
          operation.completedItems++;

          results.push({
            id: item.id,
            status: 'completed',
            data: result,
          });
        } catch (error) {
          item.status = 'failed';
          item.error = String(error);
          item.completedAt = new Date().toISOString();
          operation.failedItems++;

          results.push({
            id: item.id,
            status: 'failed',
            error: String(error),
          });

          console.error(`[Batch] Item ${item.id} failed:`, error);

          if (!continueOnError) {
            operation.status = 'failed';
            throw error;
          }
        }

        // Update progress
        operation.progress = (operation.completedItems / operation.totalItems) * 100;
      }
    };

    // Process items in chunks
    const chunks = this.chunkArray(operation.items, maxConcurrent);

    try {
      for (const chunk of chunks) {
        // Use type assertion to avoid narrowing issues
        if ((operation.status as BatchOperationStatus) === 'cancelled' ||
            (operation.status as BatchOperationStatus) === 'failed') {
          break;
        }
        await processBatch(chunk as BatchJobItem<T>[]);
      }

      // Determine final status
      if (operation.failedItems > 0 && !continueOnError) {
        operation.status = 'failed';
      } else if ((operation.status as BatchOperationStatus) === 'cancelled') {
        operation.status = 'cancelled';
      } else {
        operation.status = 'completed';
      }
      operation.completedAt = new Date().toISOString();
    } catch (error) {
      operation.status = 'failed';
      operation.completedAt = new Date().toISOString();
      throw error;
    }

    const duration = Date.now() - startTime;
    const successRate = (operation.completedItems / operation.totalItems) * 100;

    const result: BatchResult<R> = {
      operationId,
      type: operation.type,
      status: operation.status,
      totalItems: operation.totalItems,
      completedItems: operation.completedItems,
      failedItems: operation.failedItems,
      results,
      summary: {
        duration,
        averageTimePerItem: duration / operation.totalItems,
        successRate,
      },
    };

    console.log(
      `[Batch] Operation ${operationId} completed: ` +
      `${operation.completedItems}/${operation.totalItems} successful ` +
      `(${successRate.toFixed(1)}%) in ${duration}ms`
    );

    // Send webhook notification if configured
    if (options.notifyOnComplete && options.notificationWebhook) {
      this.sendNotification(options.notificationWebhook, result).catch((err) => {
        console.error('[Batch] Failed to send notification:', err);
      });
    }

    return result;
  }

  /**
   * Batch upload assets
   *
   * @param items Assets to upload
   * @param options Operation options
   * @param creator Callback to create each asset
   * @returns Batch result
   */
  async batchUpload(
    items: BatchUploadItem[],
    options?: BatchOperationOptions,
    creator?: (item: BatchUploadItem) => Promise<Asset3D>
  ): Promise<BatchResult<Asset3D>> {
    const operation = this.createOperation('upload', items, options);

    const callback = creator
      ? async (item: BatchUploadItem) => await creator(item)
      : async (item: BatchUploadItem) => {
          // Default stub implementation
          return {
            id: randomUUID(),
            name: item.name,
            masterUrl: item.masterUrl,
            status: item.status || 'draft',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as Asset3D;
        };

    return this.executeOperation(operation.id, callback);
  }

  /**
   * Batch delete assets
   *
   * @param items Asset IDs to delete
   * @param options Operation options
   * @param deleter Callback to delete each asset
   * @returns Batch result
   */
  async batchDelete(
    items: BatchDeleteItem[],
    options?: BatchOperationOptions,
    deleter?: (item: BatchDeleteItem) => Promise<boolean>
  ): Promise<BatchResult<boolean>> {
    const operation = this.createOperation('delete', items, options);

    const callback = deleter
      ? async (item: BatchDeleteItem) => await deleter(item)
      : async (item: BatchDeleteItem) => {
          // Default stub implementation
          return true;
        };

    return this.executeOperation(operation.id, callback);
  }

  /**
   * Batch update assets
   *
   * @param items Assets to update
   * @param options Operation options
   * @param updater Callback to update each asset
   * @returns Batch result
   */
  async batchUpdate(
    items: BatchUpdateItem[],
    options?: BatchOperationOptions,
    updater?: (item: BatchUpdateItem) => Promise<Asset3D | null>
  ): Promise<BatchResult<Asset3D | null>> {
    const operation = this.createOperation('update', items, options);

    const callback = updater
      ? async (item: BatchUpdateItem) => await updater(item)
      : async (item: BatchUpdateItem) => {
          // Default stub implementation
          return null;
        };

    return this.executeOperation(operation.id, callback);
  }

  /**
   * Get operation status
   *
   * @param operationId Operation ID
   * @returns Operation or undefined
   */
  getOperation(operationId: string): BatchOperation | undefined {
    return this.operations.get(operationId);
  }

  /**
   * Get all operations
   *
   * @param type Optional type filter
   * @returns Array of operations
   */
  getOperations(type?: BatchOperationType): BatchOperation[] {
    const all = Array.from(this.operations.values());
    return type ? all.filter(op => op.type === type) : all;
  }

  /**
   * Cancel an operation
   *
   * @param operationId Operation ID
   * @returns True if cancelled
   */
  cancelOperation(operationId: string): boolean {
    const operation = this.operations.get(operationId);
    if (!operation) {
      return false;
    }

    if (operation.status !== 'pending' && operation.status !== 'running') {
      return false;
    }

    operation.status = 'cancelled';
    operation.completedAt = new Date().toISOString();

    console.log(`[Batch] Operation ${operationId} cancelled`);

    return true;
  }

  /**
   * Delete an operation record
   *
   * @param operationId Operation ID
   * @returns True if deleted
   */
  deleteOperation(operationId: string): boolean {
    return this.operations.delete(operationId);
  }

  /**
   * Clean up old completed operations
   *
   * @param olderThan Delete operations older than this (milliseconds)
   * @returns Number of operations deleted
   */
  cleanupOldOperations(olderThan: number = 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - olderThan;
    let deleted = 0;

    for (const [id, op] of this.operations.entries()) {
      const completedAt = op.completedAt ? new Date(op.completedAt).getTime() : 0;
      if (
        (op.status === 'completed' || op.status === 'failed' || op.status === 'cancelled') &&
        completedAt < cutoff
      ) {
        this.operations.delete(id);
        deleted++;
      }
    }

    if (deleted > 0) {
      console.log(`[Batch] Cleaned up ${deleted} old operation(s)`);
    }

    return deleted;
  }

  /**
   * Get statistics
   *
   * @returns Batch operation statistics
   */
  getStatistics(): {
    totalOperations: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
    totalItemsProcessed: number;
  } {
    const operations = Array.from(this.operations.values());

    return {
      totalOperations: operations.length,
      pending: operations.filter(op => op.status === 'pending').length,
      running: operations.filter(op => op.status === 'running').length,
      completed: operations.filter(op => op.status === 'completed').length,
      failed: operations.filter(op => op.status === 'failed').length,
      cancelled: operations.filter(op => op.status === 'cancelled').length,
      totalItemsProcessed: operations.reduce((sum, op) => sum + op.completedItems, 0),
    };
  }

  /**
   * Send notification webhook
   *
   * @param url Webhook URL
   * @param result Operation result
   */
  private async sendNotification(url: string, result: BatchResult): Promise<void> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'batch_operation_complete',
          operationId: result.operationId,
          type: result.type,
          status: result.status,
          summary: result.summary,
        }),
      });

      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}`);
      }

      console.log(`[Batch] Notification sent to ${url}`);
    } catch (error) {
      console.error(`[Batch] Failed to send notification to ${url}:`, error);
      throw error;
    }
  }

  /**
   * Split array into chunks
   *
   * @param array Array to chunk
   * @param size Chunk size
   * @returns Array of chunks
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

/**
 * Create a batch operations service instance
 */
export function createBatchOperationsService(): BatchOperationsService {
  return new BatchOperationsService();
}
