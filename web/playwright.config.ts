import { defineConfig } from '@playwright/test';

// End-to-end tests run against `vite preview` of a production build, with the real Unity build in
// web/public/unity/ (tools/unity.sh build). Headless Chromium gets WebGL 2 through SwiftShader.
// If a run cannot get a WebGL 2 context headless, run it headed: `npx playwright test --headed`.
export default defineConfig({
  testDir: './e2e',
  // The helpers under e2e/support/ have vitest tests (*.test.ts); Playwright runs only *.spec.ts.
  testMatch: '**/*.spec.ts',
  // The Studio test starts the Service too; it has its own config (playwright.studio.config.ts).
  testIgnore: '**/studio*.spec.ts',
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
