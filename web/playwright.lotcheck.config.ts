import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// The lot check pages (spec 08 task 10): the Landing, the Result and the How page, in a Chromium with no
// WebGL, against `vite preview` of the production build. No Unity build is needed. Its own server on its own
// port (4178), never reused, so it always sees this folder's `dist/`. Run after `npm run build`:
//   npx playwright test -c playwright.lotcheck.config.ts
const PORT = 4178;
const ORIGIN = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  ...base,
  testMatch: ['**/lotcheck.spec.ts'],
  use: { ...base.use, baseURL: ORIGIN, launchOptions: { args: ['--disable-gpu', '--disable-3d-apis', '--disable-webgl'] } },
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: ORIGIN,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
