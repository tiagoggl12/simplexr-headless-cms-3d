import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import type { IncomingMessage } from 'http';
import type { ProxyOptions } from 'vite';

// API target: defaults to the locally-running backend; Docker can override
// with VITE_API_TARGET=http://backend:3000
const apiTarget = process.env.VITE_API_TARGET ?? 'http://localhost:3000';

// Some API path prefixes (/assets, /uploads) collide with client-side SPA
// routes. Browser navigations send `Accept: text/html`; API calls (axios)
// do not. For navigations, bypass the proxy and serve index.html so the SPA
// router handles deep links / refreshes instead of hitting the JSON API.
const bypassNavigations = (req: IncomingMessage): string | undefined =>
  req.headers.accept?.includes('text/html') ? '/index.html' : undefined;

// API path prefixes proxied to the backend during development.
const API_PREFIXES = ['/assets', '/uploads', '/presets', '/viewer', '/auth', '/variants'];

const proxy: Record<string, ProxyOptions> = Object.fromEntries(
  API_PREFIXES.map((prefix) => [
    prefix,
    { target: apiTarget, changeOrigin: true, bypass: bypassNavigations } satisfies ProxyOptions,
  ])
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy,
  },
});
