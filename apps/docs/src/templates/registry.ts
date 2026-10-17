/**
 * Every template, read from the folders' own `meta.ts`: a folder that adds one is in the grid,
 * the sitemap and the social cards, with nothing to register by hand.
 */
import type { TemplateMeta } from './types';

const modules = import.meta.glob<{ default: TemplateMeta }>('./*/meta.ts', { eager: true });

export const TEMPLATES: TemplateMeta[] = Object.entries(modules)
    .map(([path, module]) => {
        const folder = path.split('/')[1];
        if (module.default.slug !== folder) {
            throw new Error(`src/templates/${folder}/meta.ts says slug "${module.default.slug}": a template's slug is its folder's name.`);
        }
        return module.default;
    })
    .sort((a, b) => a.order - b.order);

export function findTemplate(slug: string): TemplateMeta | undefined {
    return TEMPLATES.find((t) => t.slug === slug);
}
