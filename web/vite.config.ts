import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { dataPlugin } from './vite/dataPlugin';

// The Unity build lives in public/unity/ (gitignored); Vite serves public/ as-is and copies it
// into dist/. The data plugin serves the repository's data/ folder, allowed paths only, at /data/.
//
// /v1 goes to the Studio service (spec 04). The Studio calls it on the page's own origin, so the dev
// and preview servers pass it on and the browser needs no CORS rule. The target is
// BURIED_SERVICE_URL (default http://127.0.0.1:8000, where `uvicorn` listens by default).
const serviceTarget = process.env.BURIED_SERVICE_URL ?? 'http://127.0.0.1:8000';
const serviceProxy = { '/v1': { target: serviceTarget, changeOrigin: false } };

export default defineConfig({
  plugins: [react(), dataPlugin()],
  server: {
    port: 5173,
    // The Schema files are imported from ../data/schema.
    fs: { allow: ['..'] },
    proxy: serviceProxy,
  },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: serviceProxy,
  },
  build: {
    target: 'es2022',
  },
});
