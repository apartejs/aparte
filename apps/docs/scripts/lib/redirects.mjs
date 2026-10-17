/**
 * Every redirect of the site, as Node reads it (astro.config.mjs, check-legacy-urls.mjs): the
 * hand-made moves plus the catalogue's, from the catalogue's own files. The redirect route
 * (src/pages/[...moved].astro) computes the same map from Astro's collection.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOVED, catalogueRedirects } from '../../src/data/redirects.mjs';
import { readCatalogue } from './catalogue.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const legacy = JSON.parse(readFileSync(resolve(here, '../../src/data/legacy-urls.json'), 'utf8'));

/** @type {Record<string, string>} */
export const REDIRECTS = { ...MOVED, ...catalogueRedirects(readCatalogue(), legacy.urls) };
