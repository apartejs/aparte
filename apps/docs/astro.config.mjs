import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: 'aparté',
      description: 'Framework-agnostic AI-chat library — vanilla web components, zero dependencies.',
      customCss: ['./src/styles/palette.css', './src/styles/aparte-theme.css'],
      sidebar: [
        { label: 'Guides', autogenerate: { directory: 'guides' } },
        { label: 'Reference', autogenerate: { directory: 'reference' } },
      ],
    }),
  ],
});
