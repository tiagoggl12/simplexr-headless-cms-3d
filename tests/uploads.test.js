import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
describe('Upload presign', () => {
    it('returns a presigned upload URL', async () => {
        const app = await createApp();
        const res = await app.inject({
            method: 'POST',
            url: '/uploads/presign',
            payload: { path: 'assets/chair.glb' },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.url).toContain('assets/chair.glb');
        expect(body.method).toBe('PUT');
        await app.close();
    });
});
