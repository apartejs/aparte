import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { changelogsLoader } from 'starlight-changelogs/loader';

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  // The path is relative to THIS Starlight project, so two levels up is the repo root.
  changelogs: defineCollection({
    loader: changelogsLoader([
      { provider: 'changeset', base: 'changelog', changelog: '../../CHANGELOG.md' },
    ]),
  }),
};
