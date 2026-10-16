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
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
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
 * How many tests ran on the last `pnpm test` (stamped by scripts/stamp-test-count.mjs), or null
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

/**
 * What `import '@aparte/core'` costs a page, gzipped: the entry and every chunk it imports
 * statically, then the stylesheet. Read from core's build output, so the site builds after core.
 */
export const CORE_WEIGHT = (() => {
    const dist = 'packages/core/dist/';
    const seen = new Set<string>();
    const walk = (file: string): number => {
        if (seen.has(file)) return 0;
        seen.add(file);
        const source = read(dist + file);
        const imports = [...source.matchAll(/(?:import|from)\s*["']\.\/([\w.-]+\.js)["']/g)].map((match) => match[1] as string);
        return gzipSync(source).length + imports.reduce((sum, child) => sum + walk(child), 0);
    };
    const kb = (bytes: number): number => Math.round(bytes / 1024);
    const js = walk('index.js');
    if (js < 10 * 1024) throw new Error(`facts: core's entry gzips to ${js} bytes — the build output moved; build core first.`);
    return { js: kb(js), css: kb(gzipSync(read(dist + 'index.css')).length) };
})();
