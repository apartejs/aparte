import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Measures one of the model packages the site installs: the version from its own
 * `package.json` and the weight of the bundled model file, both read at build time —
 * shared so the product page (`pages/models/titler.astro`) and any other page quoting
 * the same figure (the landing) read the installed file once, instead of one page
 * measuring it and the other typing what it once said. `process.cwd()` is the Astro
 * project root (`apps/docs`) however this builds, for the reason `titler.astro` and
 * `index.astro` already give: counting `../` from `import.meta.url` broke the day Astro
 * started prerendering from bundled chunks.
 */
const require = createRequire(pathToFileURL(`${process.cwd()}/`).href);

export interface BundledModel {
    pkg: string;
    languages: string[];
    version: string;
    /** The model file's size on disk, rounded to the nearest KB. */
    kb: number;
}

export function bundled(pkg: string, languages: string[] = []): BundledModel {
    const file = require.resolve(`${pkg}/model`);
    const root = resolve(dirname(file), '..');
    const version: string = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
    return { pkg, languages, version, kb: Math.round(statSync(file).size / 1000) };
}
