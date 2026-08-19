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
const AXE = /a11y\.spec\.ts/;
const LAYOUT = /bubble-layout\.spec\.ts/;
const STREAMING = /streaming-lifecycle\.spec\.ts/;
const ERRORS = /errors\.spec\.ts/;
const ACTIONS = /bubble-actions\.spec\.ts/;
const MULTICHAT = /multi-chat\.spec\.ts/;
const SEGMENTS = /segments\.spec\.ts/;
const ATTACH = /attachments\.spec\.ts/;
const SELECTOR = /model-selector\.spec\.ts/;
const RESPONSIVE = /responsive\.spec\.ts/;
// The waiting-state CONTRACT: written, `fixme`, and waiting for the design work
// that turns it on (see the file header).
const PENDING = /pending-state\.spec\.ts/;

// Which specs a given app runs.
//
// - Every framework app runs the boundary smoke + the a11y scan: those are about
//   the wrapper boundary, so they must run five times.
// - The deep behaviour suites (turn lifecycle, failure paths) exercise core's own
//   DOM/CSS, which is identical everywhere. Running them on `vanilla` (core raw)
//   and `react` (the reference wrapper, and what the first real consumer uses)
//   proves them without paying five times the wall clock.
// - `bubble-layout` stays vanilla-only: it injects a message straight into the
//   viewport to assert core's CSS geometry, and in framework-managed mode the
//   framework owns the DOM, so such an injection renders no bubble by design.
// - demo-vanilla owns the human-in-the-loop suite and consumes core's built dist.
const DEEP: RegExp[] = [STREAMING, ERRORS, ACTIONS, SEGMENTS, ATTACH, SELECTOR, RESPONSIVE];
const suiteFor = (k: AppKey): RegExp[] =>
    k === 'demo-vanilla' ? [DEMO] :
    k === 'vanilla' ? [SMOKE, REAL, AXE, LAYOUT, MULTICHAT, PENDING, ...DEEP] :
    k === 'react' ? [SMOKE, REAL, AXE, ...DEEP] :
    [SMOKE, REAL, AXE];

// Also run under WebKit (Safari engine) — the browser where custom-element
// upgrade, Shadow DOM and CSS-variable behaviour is most likely to diverge from
// Chromium. The framework wrappers are included: "they only mount the same
// elements" is exactly the assumption that keeps being wrong at the framework
// boundary, which is where every browser-only bug in this project has lived.
// Angular stays Chromium-only (its dev server is slow enough to dominate the run).
const WEBKIT_APPS: AppKey[] = ['vanilla', 'demo-vanilla', 'react', 'vue', 'svelte'];

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
            testMatch: suiteFor(k),
        })),
        // Same suites under WebKit, for the pure web-component playgrounds.
        ...selected.filter((k) => WEBKIT_APPS.includes(k)).map((k) => ({
            name: `${k}-webkit`,
            use: { ...devices['Desktop Safari'], baseURL: url(k) },
            testMatch: suiteFor(k),
        })),
    ],
});
