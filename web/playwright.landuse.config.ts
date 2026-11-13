import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// The land-use tracing test (session 032) on ports of its own, so it never talks to a preview server
// or a Studio service that another checkout left running: the Service on 8766, `vite preview` on
// 4184, neither reused. It is the Studio config with other ports.
// Run after `npm run build`: `npx playwright test -c playwright.landuse.config.ts`.
const SERVICE_PORT = 8766;
const PREVIEW_PORT = 4184;
const SERVICE_URL = `http://127.0.0.1:${SERVICE_PORT}`;

export default defineConfig({
  ...base,
  testIgnore: undefined,
  testMatch: '**/studio-landuse.spec.ts',
  use: { ...base.use, baseURL: `http://127.0.0.1:${PREVIEW_PORT}` },
  webServer: [
    {
      command: `uv --directory ../pipeline run --extra service uvicorn buried_pipeline.service.app:create_app --factory --host 127.0.0.1 --port ${SERVICE_PORT}`,
      url: `${SERVICE_URL}/v1/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { BURIED_TEST_MODE: '1' },
    },
    {
      command: `npx vite preview --host 127.0.0.1 --port ${PREVIEW_PORT} --strictPort`,
      url: `http://127.0.0.1:${PREVIEW_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { BURIED_SERVICE_URL: SERVICE_URL },
    },
  ],
});
