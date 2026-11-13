import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// The Block page with the real Player (spec 06 W12, session 042). These specs are tagged `@unity`: they need the
// Unity build in web/public/unity/ (tools/unity.sh build, then `npm run build`) and run in the main suite, which has
// it. This config starts its own `vite preview` on port 4176 and never reuses a server. Run:
//   npx playwright test -c playwright.block.config.ts
// The no-WebGL spec has its own config (playwright.blockflat.config.ts).
const PORT = 4176;
const ORIGIN = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  ...base,
  testMatch: ['**/block.spec.ts', '**/block-phone.spec.ts'],
  use: { ...base.use, baseURL: ORIGIN },
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: ORIGIN,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
