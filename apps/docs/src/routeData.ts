/**
 * Starlight's route middleware: what a generated page cannot say in a frontmatter of its own.
 *
 * The changelog's pages are built by `starlight-changelogs` from the release notes, with no
 * description, so each one fell back to the site's — 66 pages telling a search engine the same
 * sentence. A version page now says which version it is about; the list says it is the list.
 */
import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
import { CHANGELOG_COMPARE } from './lib/changelog-compare.mjs';

export const onRequest = defineRouteMiddleware((context) => {
    const route = context.locals.starlightRoute;
    const path = context.url.pathname;
    if (!path.startsWith('/changelog/')) return;
    if (CHANGELOG_COMPARE.test(path)) return;   // a comparison page: noindex
    // The version is the page's own title ("0.30.0 | Changelog | aparté"); the entry's is "Changelog".
    const title = route.head.find((tag) => tag.tag === 'title')?.content?.split(' | ')[0];
    const version = path.startsWith('/changelog/version/');
    if (version && !title) return;   // never the list's sentence on a version page
    const page = /^\/changelog\/(\d+)\/$/.exec(path)?.[1];
    const description = version
        ? `Release notes for aparté ${title}: what changed in each @aparte package, and what to update.`
        : `Every aparté release, newest first: the release notes of each @aparte package${page ? ` (page ${page})` : ''}.`;
    route.entry.data.description = description;
    // The head is built before this runs: its description tags are rewritten in place.
    for (const tag of route.head) {
        const key = tag.attrs?.['name'] ?? tag.attrs?.['property'];
        if (tag.tag === 'meta' && tag.attrs && (key === 'description' || key === 'og:description')) {
            tag.attrs['content'] = description;
        }
    }
});
