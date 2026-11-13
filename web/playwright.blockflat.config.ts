import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// The Block page without WebGL (spec 06 W12, session 042): the Flat sheet. It needs no Unity build, so it runs here.
// Like playwright.hosting.config.ts it starts its own `vite preview` on its own port (4175) and never reuses a server,
// so it always sees this folder's `dist/`. Run after `npm run build`:
//   npx playwright test -c playwright.blockflat.config.ts
const PORT = 4175;
const ORIGIN = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  ...base,
  testMatch: ['**/block-flat.spec.ts'],
  use: { ...base.use, baseURL: ORIGIN },
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: ORIGIN,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
