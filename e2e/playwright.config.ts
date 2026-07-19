import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Browser smoke E2E across every playground.
 *
 * One Playwright config boots all six example apps and drives them through the
 * SAME set of framework-boundary assertions (mount without runtime errors, the
 * model selector populates + ungates the composer, a message streams a reply in
 * the right order, and the transcript scrolls once it overflows). Everything the
 * jsdom unit tests couldn't see — and every M6 bug lived exactly here.
 *
 * The model API is network-mocked (see helpers/mock-llm.ts), so no key, no LM
 * Studio, and no network are required — the run is identical everywhere.
 */

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// One fixed port per app (clear of Vite's 5173-5177 defaults used by manual dev).
const PORTS = {
    react: 5301,
    vue: 5302,
    svelte: 5303,
    angular: 5304,
    vanilla: 5305,
    'demo-vanilla': 5306,
} as const;

type AppKey = keyof typeof PORTS;

const url = (app: AppKey) => `http://localhost:${PORTS[app]}`;

// Vite dev server for `app`, forcing the port. `exec vite --port` (not
// `dev -- --port`) sidesteps pnpm swallowing the `--` separator.
function viteServer(app: AppKey, pkg: string) {
    return {
        command: `pnpm --filter ${pkg} exec vite --port ${PORTS[app]} --strictPort`,
        url: url(app),
        cwd: rootDir,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: 'pipe' as const,
        stderr: 'pipe' as const,
    };
}

// The apps under test. `E2E_ONLY=react,vanilla` narrows the boot set (and the
// started servers) during local iteration; unset → all six.
const APPS: Record<AppKey, { pkg: string; server: ReturnType<typeof viteServer> }> = {
    react: { pkg: '@aparte-workspace/playground-react', server: viteServer('react', '@aparte-workspace/playground-react') },
    vue: { pkg: '@aparte-workspace/playground-vue', server: viteServer('vue', '@aparte-workspace/playground-vue') },
    svelte: { pkg: '@aparte-workspace/playground-svelte', server: viteServer('svelte', '@aparte-workspace/playground-svelte') },
    vanilla: { pkg: '@aparte-workspace/playground-vanilla', server: viteServer('vanilla', '@aparte-workspace/playground-vanilla') },
    'demo-vanilla': { pkg: '@aparte-workspace/demo-vanilla', server: viteServer('demo-vanilla', '@aparte-workspace/demo-vanilla') },
    // Angular uses its own CLI dev server (no Vite).
    angular: {
        pkg: '@aparte-workspace/playground-angular',
        server: {
            command: `pnpm --filter @aparte-workspace/playground-angular exec ng serve --port ${PORTS.angular}`,
            url: url('angular'),
            cwd: rootDir,
            reuseExistingServer: !process.env.CI,
            timeout: 180_000,
            stdout: 'pipe' as const,
            stderr: 'pipe' as const,
        },
    },
};

const only = process.env.E2E_ONLY?.split(',').map((s) => s.trim()).filter(Boolean) as AppKey[] | undefined;
const selected = (Object.keys(APPS) as AppKey[]).filter((k) => !only || only.includes(k));

const SMOKE = /framework-smoke\.spec\.ts/;
const REAL = /real-model\.spec\.ts/;
const DEMO = /demo-vanilla\.spec\.ts/;

// Also run the pure web-component playgrounds under WebKit (Safari engine) — the
// browser where custom-element upgrade / Shadow DOM / CSS-variable behavior is most
// likely to diverge from Chromium. The framework wrappers just mount the same
// elements, so covering vanilla + demo-vanilla exercises the core across engines.
const WEBKIT_APPS: AppKey[] = ['vanilla', 'demo-vanilla'];

export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
    timeout: 45_000,
    expect: { timeout: 10_000 },

    use: {
        viewport: { width: 1000, height: 720 },
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },

    // Boot only the selected apps' servers.
    webServer: selected.map((k) => APPS[k].server),

    // One project per app; the five framework apps share the smoke suite,
    // demo-vanilla runs its human-in-the-loop suite.
    projects: [
        ...selected.map((k) => ({
            name: k,
            use: { ...devices['Desktop Chrome'], baseURL: url(k) },
            // Framework apps run the smoke suite + the opt-in real-model smoke (which
            // self-skips unless E2E_REAL_MODEL=1); demo-vanilla runs its HITL suite.
            testMatch: k === 'demo-vanilla' ? DEMO : [SMOKE, REAL],
        })),
        // Same suites under WebKit, for the pure web-component playgrounds.
        ...selected.filter((k) => WEBKIT_APPS.includes(k)).map((k) => ({
            name: `${k}-webkit`,
            use: { ...devices['Desktop Safari'], baseURL: url(k) },
            testMatch: k === 'demo-vanilla' ? DEMO : [SMOKE, REAL],
        })),
    ],
});
