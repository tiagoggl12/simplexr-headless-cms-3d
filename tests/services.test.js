import { describe, expect, it } from 'vitest';
import { LocalStorageService } from '../src/services/storage.js';
import { InMemoryQueue } from '../src/services/queue.js';
describe('StorageService', () => {
    it('returns a presigned upload stub', async () => {
        const storage = new LocalStorageService('s3://bucket');
        const result = await storage.presignUpload('assets/chair.glb');
        expect(result.url).toContain('assets/chair.glb');
        expect(result.method).toBe('PUT');
    });
});
describe('Queue', () => {
    it('records jobs in memory', async () => {
        const queue = new InMemoryQueue();
        await queue.enqueue('process-asset', { assetId: 'a1' });
        const jobs = queue.list();
        expect(jobs).toHaveLength(1);
        expect(jobs[0].type).toBe('process-asset');
    });
});
