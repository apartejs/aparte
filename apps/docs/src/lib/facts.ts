/**
 * The numbers the site quotes, measured from the repo at build time.
 *
 * One module, so the home, the roadmap and the comparison page cannot print two values for one
 * fact. Every figure is read or counted here, on every build; anything that could only be
 * estimated is left out rather than printed as if it were exact.
 *
 * The repo is found from `process.cwd()` (the docs app's root, however the build is started),
 * not from `import.meta.url`: Astro prerenders from bundled chunks, where that URL points inside
 * `dist/`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readCatalogue } from '../../scripts/lib/catalogue.mjs';

const REPO = new URL('../../', pathToFileURL(`${process.cwd()}/`).href);
const at = (path: string): URL => new URL(path, REPO);
const read = (path: string): string => readFileSync(at(path), 'utf8');
const json = <T>(path: string): T => JSON.parse(read(path)) as T;

const corePackage = json<{ version: string; dependencies?: Record<string, string> }>('packages/core/package.json');

/** The published version of @aparte/core. */
export const CORE_VERSION = corePackage.version;

/** Runtime dependencies of @aparte/core that are not first-party (@aparte/engine is). */
export const CORE_THIRD_PARTY_DEPS = Object.keys(corePackage.dependencies ?? {}).filter((name) => !name.startsWith('@aparte/')).length;

/** The component catalogue: every page, in all and per group. */
const catalogue = readCatalogue(fileURLToPath(at('apps/docs/src/content/docs/components')));
export const COMPONENTS = {
    total: catalogue.length,
    chat: catalogue.filter((entry) => entry.group === 'chat').length,
    layout: catalogue.filter((entry) => entry.group === 'layout').length,
    kit: catalogue.filter((entry) => entry.group === 'kit').length,
};
if (COMPONENTS.total < 40) {
    throw new Error(`facts: the catalogue counted ${COMPONENTS.total} pages — the reader moved or the pages did; fix that rather than publishing a small number.`);
}

/**
 * How many tests ran on the last `pnpm test:coverage` (stamped by scripts/stamp-test-count.mjs), or null
 * in a clone that never ran the suite: a test count cannot be had without running it.
 */
export const TESTS: { tests: number; files: number } | null = (() => {
    try {
        return json<{ tests: number; files: number }>('apps/docs/src/data/test-counts.json');
    } catch {
        return null;
    }
})();

/** The browser engines the end-to-end suite drives, read from its Playwright projects. */
export const BROWSER_ENGINES = (() => {
    const config = read('e2e/playwright.config.ts');
    const engines = [
        ['Desktop Chrome', 'Chromium'],
        ['Desktop Safari', 'WebKit'],
        ['Desktop Firefox', 'Firefox'],
    ].filter(([device]) => config.includes(`devices['${device}']`)).map(([, engine]) => engine);
    if (!engines.length) throw new Error('facts: no browser project found in e2e/playwright.config.ts.');
    return engines;
})();

/** `engines.node`, as @aparte/core declares it. */
export const NODE_FLOOR = (() => {
    const floor = json<{ engines?: { node?: string } }>('packages/core/package.json').engines?.node;
    if (!floor) throw new Error('facts: packages/core/package.json declares no engines.node.');
    return floor;
})();

/** The Node versions the CI jobs run, lowest first. */
export const CI_NODE_VERSIONS = (() => {
    const ci = read('.github/workflows/ci.yml');
    const versions = [...new Set([...ci.matchAll(/node-version:\s*'?(\d+)'?/g)].map((m) => m[1]!))]
        .sort((a, b) => Number(a) - Number(b));
    if (!versions.length) throw new Error('facts: no node-version found in .github/workflows/ci.yml.');
    return versions;
})();

/** The example apps the browser suite also runs in WebKit and in Firefox; all of them run in Chromium. */
export const E2E_APPS = (() => {
    const config = read('e2e/playwright.config.ts');
    const appsIn = (name: string): string[] =>
        (config.match(new RegExp(`const ${name}[^=]*=\\s*\\[([^\\]]*)\\]`))?.[1] ?? '').match(/'([^']+)'/g)?.map((s) => s.slice(1, -1)) ?? [];
    const webkit = appsIn('WEBKIT_APPS');
    const firefox = appsIn('FIREFOX_APPS');
    if (!webkit.length || !firefox.length) throw new Error('facts: WEBKIT_APPS or FIREFOX_APPS not found in e2e/playwright.config.ts.');
    return { webkit, firefox };
})();

/** The browser builds the pinned Playwright runs, read from its own browsers.json. */
export const CI_BROWSERS = (() => {
    const dir = readdirSync(at('node_modules/.pnpm/')).find((name) => name.startsWith('playwright-core@'));
    if (!dir) throw new Error('facts: playwright-core is not installed; the support page reads its browser builds.');
    const { browsers } = json<{ browsers: { name: string; browserVersion?: string }[] }>(`node_modules/.pnpm/${dir}/node_modules/playwright-core/browsers.json`);
    const version = (name: string, parts: number): string => {
        const found = browsers.find((b) => b.name === name)?.browserVersion;
        if (!found) throw new Error(`facts: no ${name} build in playwright-core's browsers.json.`);
        return found.split('.').slice(0, parts).join('.');
    };
    return { chromium: version('chromium', 1), webkit: version('webkit', 2), firefox: version('firefox', 1) };
})();

/** The TypeScript the packages' declarations are emitted with, as major.minor. */
export const TYPESCRIPT = (() => {
    const spec = json<{ devDependencies?: Record<string, string> }>('package.json').devDependencies?.typescript ?? '';
    const version = /(\d+\.\d+)/.exec(spec)?.[1];
    if (!version) throw new Error('facts: no typescript devDependency in the root package.json.');
    return version;
})();
