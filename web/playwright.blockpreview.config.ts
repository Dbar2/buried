import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// The Block page's design preview (spec 06 session 041). Like playwright.hosting.config.ts it starts its
// own `vite preview` on its own port and never reuses a server that happens to be listening on 4173
// (another checkout's build, for example), so the screenshots are of this folder's `dist/`.
// Run after `npm run build`: `npx playwright test -c playwright.blockpreview.config.ts`.
const PORT = 4175;
const ORIGIN = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  ...base,
  testMatch: ['**/block-preview.spec.ts'],
  use: { ...base.use, baseURL: ORIGIN },
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: ORIGIN,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
