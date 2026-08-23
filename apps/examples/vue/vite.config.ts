import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// `isCustomElement` stops Vue trying to resolve <aparte-*> tags as components
// (they're custom elements from @aparte/core). Dev resolves @aparte/* from source.
export default defineConfig(({ mode }) => ({
    base: './',
    plugins: [vue({ template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('aparte-') } } })],
    ...(mode === 'development'
        ? {
              resolve: {
                  conditions: ['@aparte-workspace/source', 'module', 'browser', 'development|production'],
              },
          }
        : {}),
}));
