import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The API sets no CORS headers, and it should not: it is a first-party backend
 * with one first-party caller. Proxying through the dev server keeps the
 * browser's origin the same as the API's and means the spike needs no change
 * to be driven from a UI.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/v1': { target: 'http://127.0.0.1:3000', changeOrigin: true },
      '/health': { target: 'http://127.0.0.1:3000', changeOrigin: true },
    },
  },
});
