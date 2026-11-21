/**
 * starlight-llms-txt's page converter, which the package does not export: astro.config.mjs
 * aliases its file under this name for the markdown twins (src/pages/[...slug]/index.md.ts).
 * The signature is the one in `entryToSimpleMarkdown.ts` of the installed version.
 */
declare module '@llms-txt/entry-to-markdown' {
    import type { APIContext } from 'astro';
    import type { CollectionEntry } from 'astro:content';
    export function entryToSimpleMarkdown(
        entry: CollectionEntry<'docs'>,
        context: APIContext,
        shouldMinify?: boolean,
    ): Promise<string>;
}
