/*
 * The markdown twin of every docs page, at `<page>/index.md` (llms.txt v2, https://llmstxt.org/:
 * "URLs without file names should append index.md").
 *
 * An agent reads `/llms.txt`, then fetches the pages it needs. The HTML page wraps the text in
 * the header, the sidebar, the live previews and their scripts; this is the text alone, which
 * fits a fetch the HTML would overflow. `/llms.txt` lists every twin (scripts/lib/llms-pages.mjs)
 * and each page points to its own with `rel="alternate"` (src/routeData.ts).
 *
 * The text is exactly a page's section of `llms-full.txt`: the same title, the same description
 * and the same body, from the same converter. starlight-llms-txt does not export it, so the
 * config aliases its file (`@llms-txt/entry-to-markdown`, astro.config.mjs); if an update
 * renames it, the build stops there rather than serving something else.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { entryToSimpleMarkdown } from '@llms-txt/entry-to-markdown';

export const getStaticPaths = (async () => {
    const docs = await getCollection('docs', (doc) => !doc.data.draft);
    return docs.map((doc) => ({ params: { slug: doc.id }, props: { doc } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async (context) => {
    const { doc } = context.props as { doc: CollectionEntry<'docs'> };
    const parts = [`# ${doc.data.hero?.title || doc.data.title}`];
    const description = doc.data.hero?.tagline || doc.data.description;
    if (description) parts.push(`> ${description}`);
    parts.push(await entryToSimpleMarkdown(doc, context, false));
    return new Response(`${parts.join('\n\n')}\n`, {
        headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    });
};
