import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// The static-host check and the polish screenshots (session 027). They must see exactly this
// folder's `dist/`, so this config starts its own `vite preview` on its own port and never reuses a
// server that happens to be listening on 4173 (another checkout's build, for example).
// Run after `npm run build`: `npx playwright test -c playwright.hosting.config.ts`.
// hosting.spec.ts loads `/`, `/find/<slug>`, `/place`, `/place?lot=...`, `/report`, `/sources` and
// `/studio` as first requests (spec 06 W2 added the first three).
const PORT = 4174;
const ORIGIN = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  ...base,
  testMatch: ['**/hosting.spec.ts', '**/polish.spec.ts', '**/report.spec.ts', '**/cardsync.spec.ts'],
  use: { ...base.use, baseURL: ORIGIN },
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: ORIGIN,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
