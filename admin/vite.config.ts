import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// API target: defaults to the locally-running backend; Docker can override
// with VITE_API_TARGET=http://backend:3000
const apiTarget = process.env.VITE_API_TARGET ?? 'http://localhost:3000';

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
    proxy: {
      '/assets': {
        target: apiTarget,
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        },
      },
      '/uploads': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/presets': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/viewer': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/auth': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/variants': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
