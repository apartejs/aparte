import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { changelogsLoader } from 'starlight-changelogs/loader';

/**
 * A catalogue page says what it is in its own frontmatter: its group, its place in it, what it
 * documents (so nothing is documented twice or never — scripts/check-catalogue.mjs) and the live
 * demos it shows. scripts/lib/catalogue.mjs reads the same block outside Astro.
 */
const catalog = z
  .object({
    group: z.enum(['chat', 'cards', 'layout', 'kit']),
    order: z.number().int().nonnegative(),
    claims: z
      .object({
        elements: z.array(z.string()).default([]),
        segments: z.array(z.string()).default([]),
        classes: z.array(z.string()).default([]),
        plugin: z.string().optional(),
      })
      .default({ elements: [], segments: [], classes: [] }),
    demos: z.array(z.string()).default([]),
  })
  .optional();

/** A guide names its group in the Docs sidebar; scripts/lib/guides.mjs reads the same field. */
const guide = z
  .object({ group: z.enum(['start', 'models', 'agents', 'conversations', 'look', 'help']) })
  .optional();

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema({ extend: z.object({ catalog, guide }) }) }),
  // The path is relative to THIS Starlight project, so two levels up is the repo root.
  changelogs: defineCollection({
    loader: changelogsLoader([
      // pageSize covers every version, so the list has ONE page. With the default 10 the
      // list paginated to /changelog/2/, a route the sidebar never linked to (found when
      // the sidebar was split by a topics plugin, since removed; kept because a second
      // list page still helps nobody). check-doc-links caught it; neither plugin did.
      { provider: 'changeset', base: 'changelog', changelog: '../../CHANGELOG.md', pageSize: 50 },
    ]),
  }),
};
