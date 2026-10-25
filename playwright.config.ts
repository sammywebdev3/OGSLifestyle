/**
 * Browser tests for the character lab (tests/lab). They build the app locally, serve it on localhost and drive it
 * in headless Chromium. Nothing here talks to Supabase, Vercel or any other service: the build gets empty Supabase
 * settings (so the app runs in offline guest mode) and every request to another host is blocked by the tests.
 *
 *   npm run test:lab          lab build (NEXT_PUBLIC_CHARACTER_LAB=1), then a normal build (lab disabled)
 *   npm run test:lab:perf     performance traces and measurements from the lab build (tests/lab/perf.spec.ts)
 *
 * LAB_TARGET picks the build: 'lab' or 'flag-off' (scripts/test-lab.sh runs both, one after the other, because
 * both builds use the same .next directory).
 */
import { defineConfig, devices } from '@playwright/test';

const target = process.env.LAB_TARGET === 'flag-off' ? 'flag-off' : 'lab';
const port = target === 'lab' ? 3310 : 3311;
// Software WebGL (SwiftShader): headless Chromium on a machine without a GPU. Results are a browser simulation.
const launchOptions = { args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] };
const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, launchOptions };
// A phone viewport (size, pixel ratio, touch) in desktop Chromium: an emulation, not an Android device.
const phone = { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, launchOptions };

export default defineConfig({
  testDir: 'tests/lab',
  outputDir: 'test-results/lab',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1, // one WebGL page at a time: timings stay comparable on a small machine
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: target === 'lab'
    ? [
        { name: 'lab-desktop', use: desktop, testIgnore: [/flag-off\.spec/, /perf\.spec/] },
        { name: 'lab-phone', use: phone, testMatch: [/atlas-selection\.spec/, /loading\.spec/] },
        { name: 'lab-perf', use: desktop, testMatch: /perf\.spec/ },
      ]
    : [{ name: 'flag-off', use: desktop, testMatch: /flag-off\.spec/ }],
  webServer: {
    command: `npx next build && npx next start -p ${port}`,
    url: `http://localhost:${port}/play`,
    timeout: 600_000,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      NEXT_PUBLIC_CHARACTER_LAB: target === 'lab' ? '1' : '',
      // Offline guest mode: no Supabase project is configured for test builds.
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      SUPABASE_SECRET_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      NEXT_PUBLIC_SITE_URL: '',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
});
