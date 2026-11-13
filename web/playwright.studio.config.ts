import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// The Studio slice test (spec 04, brief 019). Playwright starts the Studio service itself, from
// pipeline/, beside `vite preview` of the production build. The preview passes /v1 to the Service
// (BURIED_SERVICE_URL, see vite.config.ts). The Service reads the plates from data/raw/ and writes
// nothing under data/.
const SERVICE_PORT = 8765;
const SERVICE_URL = `http://127.0.0.1:${SERVICE_PORT}`;

export default defineConfig({
  ...base,
  testIgnore: undefined,
  testMatch: '**/studio*.spec.ts',
  webServer: [
    {
      command: `uv --directory ../pipeline run --extra service uvicorn buried_pipeline.service.app:create_app --factory --host 127.0.0.1 --port ${SERVICE_PORT}`,
      url: `${SERVICE_URL}/v1/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { BURIED_TEST_MODE: '1' },
    },
    {
      command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      timeout: 60_000,
      env: { BURIED_SERVICE_URL: SERVICE_URL },
    },
  ],
});
