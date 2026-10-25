import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * The meta-framework fixtures: one server-rendered page each in Next (App Router), Nuxt,
 * SvelteKit and Angular SSR, under `e2e/ssr/<name>/`. Each is BUILT and STARTED as its framework
 * ships it — `ssr:build` then `ssr:start`, a production server — and checked in Chromium by
 * `tests-ssr/meta-framework.spec.ts`: the HTML the server sent, the hydration, a streamed reply,
 * and a tool call drawn by the framework's own component.
 *
 * The examples' dev servers prove the wrappers in a browser; they cannot prove a server render,
 * because none of them renders on a server. These do, and nothing else in the repo does.
 *
 * `pnpm e2e:ssr`. `E2E_SSR_ONLY=next,nuxt` narrows the fixtures (and the servers started).
 */

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const PORTS = {
    next: 5401,
    nuxt: 5402,
    sveltekit: 5403,
    angular: 5404,
} as const;

type Fixture = keyof typeof PORTS;

const only = process.env.E2E_SSR_ONLY?.split(',').map((s) => s.trim()).filter(Boolean) as Fixture[] | undefined;
const selected = (Object.keys(PORTS) as Fixture[]).filter((k) => !only || only.includes(k));

export default defineConfig({
    testDir: './tests-ssr',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    // A check that passes only on its retry fails the job, as in the main suite: a hydration
    // mismatch seen on the first load only is still a mismatch.
    failOnFlakyTests: !!process.env.CI,
    workers: process.env.CI ? 2 : 4,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-ssr' }]] : [['list']],
    timeout: 45_000,
    expect: { timeout: 10_000 },
    use: {
        viewport: { width: 1000, height: 720 },
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },
    webServer: selected.map((k) => ({
        // A build, then its server: what a deployment runs, not a dev server. A production build,
        // except Angular's: optimised, Angular hydrates without checking a single node, so the
        // fixture builds with optimisation off (`hydration-checks`) and a mismatch throws.
        command: 'pnpm run ssr:build && pnpm run ssr:start',
        cwd: resolve(rootDir, 'e2e/ssr', k),
        url: `http://localhost:${PORTS[k]}`,
        env: { PORT: String(PORTS[k]), NITRO_PORT: String(PORTS[k]) },
        reuseExistingServer: false,
        timeout: 300_000,
        stdout: 'pipe' as const,
        stderr: 'pipe' as const,
    })),
    projects: selected.map((k) => ({
        name: k,
        use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PORTS[k]}` },
    })),
});
