import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Browser smoke E2E across every example.
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
    svelte4: 5303,
    angular: 5304,
    vanilla: 5305,
    'vanilla-dist': 5306,
    // The same app as `svelte`, on Svelte 5 — see apps/examples/svelte5/README.
    svelte5: 5307,
} as const;

type AppKey = keyof typeof PORTS;

const url = (app: AppKey) => `http://localhost:${PORTS[app]}`;

/** Where each dev server runs. Its own `node_modules/.bin` content is what we invoke. */
const APP_DIRS: Record<AppKey, string> = {
    react: 'apps/examples/react',
    vue: 'apps/examples/vue',
    svelte4: 'apps/examples/svelte4',
    svelte5: 'apps/examples/svelte5',
    vanilla: 'apps/examples/vanilla',
    'vanilla-dist': 'apps/examples/vanilla-dist',
    angular: 'apps/examples/angular',
};

// Vite dev server for `app`, forcing the port.
//
// Invoked as `node <vite entry>` from the app's own directory rather than through
// `pnpm --filter … exec vite`. Same server, one process instead of a chain of Windows
// `.cmd` shims (pnpm, then vite) — each of which can flash a console window, six times
// over, for every run. It also drops the reason the old form existed (`exec` was there to
// stop pnpm swallowing the `--` separator): there is no pnpm left to swallow anything.
/**
 * Reuse an already-running dev server? OPT-IN, not the default.
 *
 * `reuseExistingServer: !process.env.CI` — the old value — meant that in local runs
 * ANY dev server already listening on a example's port was silently adopted,
 * whatever code it was serving. It cost real time in this repo: a leftover Vite on
 * 5307 (the Svelte 5 example) served a build from before a packaging change, so
 * the suite reported green on code that was not under test, and nothing said so.
 *
 * CI was never affected. That is exactly what makes it dangerous: the check is
 * weakest in the one place a human runs it by hand and trusts the result.
 *
 * So the default now matches CI — always boot our own servers — and reuse is a
 * deliberate `E2E_REUSE_SERVERS=1`, the same shape as the `E2E_NO_FIREFOX` hatch
 * below. When it is off and a port is taken, `--strictPort` fails loudly, which is
 * the outcome we want over a quiet stale pass. When it is on, the run says so up
 * front, so a green result is never silently about someone else's build.
 */
const reuseServers = !process.env.CI && process.env.E2E_REUSE_SERVERS === '1';
if (reuseServers) {
    console.warn(
        '\n[e2e] E2E_REUSE_SERVERS=1 — a dev server already listening on a example'
        + '\n      port will be adopted AS IS. If it is serving an older build, this run'
        + '\n      passes on code that is not under test. Unset it before trusting a green.\n',
    );
}

function viteServer(app: AppKey) {
    return {
        command: `node node_modules/vite/bin/vite.js --port ${PORTS[app]} --strictPort`,
        url: url(app),
        cwd: resolve(rootDir, APP_DIRS[app]),
        reuseExistingServer: reuseServers,
        timeout: 120_000,
        stdout: 'pipe' as const,
        stderr: 'pipe' as const,
    };
}

// The apps under test. `E2E_ONLY=react,vanilla` narrows the boot set (and the
// started servers) during local iteration; unset → all six.
const APPS: Record<AppKey, { server: ReturnType<typeof viteServer> }> = {
    react: { server: viteServer('react') },
    vue: { server: viteServer('vue') },
    svelte4: { server: viteServer('svelte4') },
    svelte5: { server: viteServer('svelte5') },
    vanilla: { server: viteServer('vanilla') },
    'vanilla-dist': { server: viteServer('vanilla-dist') },
    // Angular uses its own CLI dev server (no Vite).
    angular: {
        server: {
            // Same reasoning as viteServer: the Angular CLI's own JS entry, no shim.
            command: `node node_modules/@angular/cli/bin/ng.js serve --port ${PORTS.angular}`,
            url: url('angular'),
            cwd: resolve(rootDir, APP_DIRS.angular),
            reuseExistingServer: reuseServers,
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
const DEMO = /vanilla-dist\.spec\.ts/;
const AXE = /a11y\.spec\.ts/;
const LAYOUT = /bubble-layout\.spec\.ts/;
const STREAMING = /streaming-lifecycle\.spec\.ts/;
// Progressive arrival: the only suite that watches a reply COME IN rather than
// read it once it is complete. Needs the paced mock, so it belongs with the
// deep suites that exercise core's own streaming behaviour.
const PROGRESSIVE = /streaming-progressive\.spec\.ts/;
const ERRORS = /errors\.spec\.ts/;
const ACTIONS = /bubble-actions\.spec\.ts/;
const MULTICHAT = /multi-chat\.spec\.ts/;
const SEGMENTS = /segments\.spec\.ts/;
// The artifact card is a plugin's (`@aparte/plugin-artifacts`), installed by the vanilla
// and React examples — the two that run the deep suites — so its first browser spec
// runs where the plugin is set up.
const ARTIFACTS = /artifacts\.spec\.ts/;
const ATTACH = /attachments\.spec\.ts/;
const SELECTOR = /model-selector\.spec\.ts/;
const TOOLBAR = /composer-toolbar\.spec\.ts/;
// The scroll button's rendered geometry (sticky vs the spacer). Both transcript
// modes matter: vanilla is core mode (absolute button), react is framework-managed
// (sticky inside the scrolling host) - where it floated `padding + spacer` too high.
const SCROLL_BTN = /scroll-button\.spec\.ts/;
// overlay-composer geometry: the full-column scroll surface, the floating stack's
// clearance, and the pinned reader surviving a composer that grows.
const OVERLAY = /overlay\.spec\.ts/;
// #57 — the send glides to the top of the view and nothing cuts it: the writes and the
// per-frame curve, against a real layout.
const SEND_GLIDE = /send-glide\.spec\.ts/;
// #56 — an older message's action bar hangs under its text, in the gap, and reserves no row.
const ACTION_BAR_BELOW = /action-bar-below\.spec\.ts/;
const RESPONSIVE = /responsive\.spec\.ts/;
// The waiting-state contract (was `fixme` until the built-in indicator landed).
const PENDING = /pending-state\.spec\.ts/;
// Two chats, two configs, and a tool that must ask the user.
// `react` ONLY — because only the react example has the workbench view. It has to
// be a WRAPPER (raw core has no `bind()`, so `vanilla` cannot reproduce the bug),
// and porting the view to the other three was dropped: the components that will
// plug into it do not exist yet, so the copies would be rewritten before they were
// read. The cost is stated rather than hidden: Vue, Svelte and Angular's `bind()`
// timing is covered by unit tests only. Wire this in for an app the moment it
// gains the view.
const INSTANCE_CONFIG = /instance-config\.spec\.ts/;
// The settings a consumer changes first — system prompt, endpoint, token.
// Runs on the two examples that HAVE the view, and is not ported to the other
// three: this is app chrome, not a wrapper-boundary claim, so proving it once was
// enough — the remaining examples would be four more copies of a form. Contrast
// INSTANCE_CONFIG above, which HAS to run on a wrapper, because the bug it covers
// is produced by `bind()` firing post-mount and raw core has no equivalent.
const SETTINGS = /settings\.spec\.ts/;
// The elicitation panel: a tool that has to ASK the user. `vanilla` only, and
// deliberately — raw core, hand-written markup, an attachment picker really in the
// DOM, and the app the first real test session used. Nothing exercised this surface
// in a browser before, because no tool ever reached the model, so nothing could
// make the panel appear.
const ELICITATION = /elicitation\.spec\.ts/;
// A segment's own identity and span, plus the app-side line built from it.
// `vanilla` only, same reasoning as LAYOUT: the "Thought for 1.4s" wrapper is APP
// code that lives in the vanilla example, so porting it to the other four would be
// four more copies of a `toFixed` proving nothing about the wrapper boundary. The
// DATA half is covered on both segment-array owners by the unit suite; this is the
// only place the whole chain — provider mock, parser, owner, bubble — runs.
const SEGMENT_META = /segment-metadata\.spec\.ts/;
// The derived CSS-variable layer. `vanilla` only, same reasoning as LAYOUT: it is
// core's own stylesheet, identical under every wrapper. It is deliberately NOT
// wrapper-parity work — but it IS in vanilla's list precisely so it also runs under
// WebKit, the engine this config already calls out as the likeliest to diverge on
// custom-property behaviour. jsdom cannot host it at all: it does not substitute
// `var()`, so every assertion in that spec passes there on a broken stylesheet.
const THEMING = /theming\.spec\.ts/;
// The shell layouts: <aparte-split> dragged, arrowed and stacked, and the application
// shell's drawer. `vanilla` only, because it is the app that HAS the layouts
// (`?layout=split`, `?layout=shell`) — and it is the whole point of them: a pointer
// drag has no jsdom equivalent (no layout, no PointerEvent, no pointer capture), and
// the case the drag scrim exists for is a pointer crossing an <iframe>, which only a
// real engine can produce. Anchored on the separator so it does not also match
// `bubble-layout.spec.ts`.
const SHELL_LAYOUT = /[\\/]layout\.spec\.ts$/;
// The transcript as a keyboard surface. `vanilla` only, and for the same reason
// THEMING is: it is core's own DOM and stylesheet, identical under every wrapper —
// but vanilla is in WEBKIT_APPS, and WebKit is the entire point here. Chromium and
// Firefox give an unfocusable overflow box a keyboard scroll of their own, so the
// defect this covers is invisible in two of the three engines, and jsdom — which has
// no layout and no scrolling at all — cannot host it in any of them.
const TRANSCRIPT_KEYS = /transcript-keyboard\.spec\.ts/;

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
// - vanilla-dist owns the human-in-the-loop suite and consumes core's built dist.
const DEEP: RegExp[] = [STREAMING, PROGRESSIVE, ERRORS, ACTIONS, SEGMENTS, ARTIFACTS, ATTACH, SELECTOR, RESPONSIVE, SCROLL_BTN, OVERLAY, SEND_GLIDE, ACTION_BAR_BELOW];
const suiteFor = (k: AppKey): RegExp[] =>
    k === 'vanilla-dist' ? [DEMO] :
    k === 'vanilla' ? [SMOKE, REAL, AXE, LAYOUT, SHELL_LAYOUT, TRANSCRIPT_KEYS, MULTICHAT, PENDING, TOOLBAR, SETTINGS, ELICITATION, SEGMENT_META, THEMING, ...DEEP] :
    k === 'react' ? [SMOKE, REAL, AXE, TOOLBAR, INSTANCE_CONFIG, SETTINGS, ...DEEP] :
    // svelte5 answers one question — does the SHIPPED SOURCE build and run on the
    // other major — so it runs the boundary smoke and the toolbar row, not the deep
    // behaviour suites (those are about core, which is major-agnostic).
    k === 'svelte5' ? [SMOKE, AXE, TOOLBAR] :
    // TOOLBAR runs on all five: it measures the same row rendered by five different
    // mechanisms (hand-written markup, a React prop, a Vue/Svelte named slot, Angular
    // content projection). Parity is exactly what it is for, so it does not get the
    // "prove it twice and trust the rest" treatment the deep suites get.
    [SMOKE, REAL, AXE, TOOLBAR];

// Also run under WebKit (Safari engine) — the browser where custom-element
// upgrade, Shadow DOM and CSS-variable behaviour is most likely to diverge from
// Chromium. The framework wrappers are included: "they only mount the same
// elements" is exactly the assumption that keeps being wrong at the framework
// boundary, which is where every browser-only bug in this project has lived.
// Angular stays Chromium-only (its dev server is slow enough to dominate the run).
const WEBKIT_APPS: AppKey[] = ['vanilla', 'vanilla-dist', 'react', 'vue', 'svelte4'];

// Local escape hatch: `E2E_NO_WEBKIT=1 pnpm e2e` drops the WebKit projects. Playwright's
// WebKit build on Windows creates a real OS window even headless, so a full run pops
// several of them and steals focus from whatever is fullscreen. Ignored under CI, which
// must keep both engines: every browser-only bug in this project has been a WebKit one.
const skipWebkit = !process.env.CI && process.env.E2E_NO_WEBKIT === '1';

// And Firefox — the third engine, and the one that was missing entirely.
//
// Gecko differs from BOTH of the others where this library lives: custom-element
// upgrade timing, `adoptedStyleSheets`, and `::part` / `:host` resolution. Shipping
// a browser-compat promise on a vanilla-web-components library while never loading
// it in a third of the desktop engine landscape is a claim, not a result.
//
// A reduced set on purpose: the boundary smoke and the a11y scan on the two apps
// that matter most (core raw, and the reference wrapper the first real consumer
// uses). The deep behaviour suites already run twice per engine; adding a third
// full pass buys correlation, not coverage, and wall clock is the budget that
// decides whether anyone runs this locally.
const FIREFOX_APPS: AppKey[] = ['vanilla', 'react'];
const FIREFOX_SUITE: RegExp[] = [SMOKE, AXE];
// Plus the shell layouts on `vanilla`, the one app that has them — and the one suite
// where a third engine buys coverage rather than correlation: the split is this
// library's first drag interaction, and Gecko is the engine whose `pointermove`
// reports 0 for a button that is still down (the reason the release check is in
// `pointermove` and never on `pointerleave`).
const firefoxSuiteFor = (k: AppKey): RegExp[] =>
    k === 'vanilla' ? [...FIREFOX_SUITE, SHELL_LAYOUT] : FIREFOX_SUITE;
const skipFirefox = !process.env.CI && process.env.E2E_NO_FIREFOX === '1';

export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    // A retry that passes still reported the whole run as GREEN, so four flakes rode
    // into main looking like a success — and one of them was a real defect (an
    // options refresh threw away the keyboard highlight, fixed in `aparte-select`).
    // Keep the retry, because the second run and its trace are what make a flake
    // diagnosable; fail the job anyway, because "sometimes red" is a result, not
    // noise. Locally retries are 0, so this changes nothing there.
    failOnFlakyTests: !!process.env.CI,
    // Locally: 8, not the default half-the-machine. Each worker is a browser, and
    // they all share the six dev servers this config boots (five Vite + the Angular
    // CLI), so the default 16 saturates a 32-thread box for the whole run.
    // Measured: 16 workers 77s -> 6 workers 87s. A tenth of the wall clock buys
    // back half the machine. CI keeps 2 (its runners have 2-4 cores).
    workers: process.env.CI ? 2 : 8,
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
    // vanilla-dist runs its human-in-the-loop suite.
    projects: [
        ...selected.map((k) => ({
            name: k,
            use: { ...devices['Desktop Chrome'], baseURL: url(k) },
            // Framework apps run the smoke suite + the opt-in real-model smoke (which
            // self-skips unless E2E_REAL_MODEL=1); vanilla-dist runs its HITL suite.
            testMatch: suiteFor(k),
        })),
        // Same suites under WebKit, for the pure web-component examples.
        ...(skipWebkit ? [] : selected.filter((k) => WEBKIT_APPS.includes(k))).map((k) => ({
            name: `${k}-webkit`,
            use: { ...devices['Desktop Safari'], baseURL: url(k) },
            testMatch: suiteFor(k),
            // WebKit is the slow engine here, and it runs alongside five other dev
            // servers. Three different specs have been seen failing ONCE each on
            // whichever webkit project was scheduled last, then passing on re-run —
            // always a locator waiting on a UI that arrived late, never a wrong
            // assertion. A suite that fails by scheduling order teaches you to
            // ignore it, so WebKit gets a longer wait rather than Chromium getting
            // a weaker one.
            expect: { timeout: 20_000 },
        })),
        // Firefox: the reduced set described at FIREFOX_APPS.
        ...(skipFirefox ? [] : selected.filter((k) => FIREFOX_APPS.includes(k))).map((k) => ({
            name: `${k}-firefox`,
            use: { ...devices['Desktop Firefox'], baseURL: url(k) },
            testMatch: firefoxSuiteFor(k),
            expect: { timeout: 20_000 },
        })),
    ],
});
