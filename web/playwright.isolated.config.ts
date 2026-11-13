import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// The same tests on their own port (4183), for a checkout that runs beside others. Several
// checkouts of this repository can be open at once, and each wants 4173; with `reuseExistingServer`
// a run then talks to another checkout's `vite preview` and its build, not its own. This config
// never reuses a server. Specs that hold the port 4173 in a constant (brand.spec.ts, art.spec.ts)
// are not meant for it. Run: `npx playwright test -c playwright.isolated.config.ts e2e/phone.spec.ts`.
const PORT = 4183;

export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: `http://127.0.0.1:${PORT}` },
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
