import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { dataPlugin } from './vite/dataPlugin';

// The Unity build lives in public/unity/ (gitignored); Vite serves public/ as-is and copies it
// into dist/. The data plugin serves the repository's data/ folder, allowed paths only, at /data/.
export default defineConfig({
  plugins: [react(), dataPlugin()],
  server: {
    port: 5173,
    // The Schema files are imported from ../data/schema.
    fs: { allow: ['..'] },
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
  },
});
