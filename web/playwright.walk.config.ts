import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// The walk test (spec 07, session 049) with the real Player, in a Chromium that draws on the GPU (the walk's night needs
// more than SwiftShader can draw at a useful rate). It needs the Unity build in web/public/unity/ (tools/unity.sh build,
// then `npm run build`). This config starts its own `vite preview` on port 4177 and never reuses a server. Run:
//   npx playwright test -c playwright.walk.config.ts
const PORT = 4177;
const ORIGIN = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  ...base,
  testMatch: ['**/walk.spec.ts'],
  timeout: 300_000,
  use: {
    ...base.use,
    baseURL: ORIGIN,
    launchOptions: { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: ORIGIN,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
