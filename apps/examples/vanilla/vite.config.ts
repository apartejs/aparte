import { defineConfig } from 'vite';

// Dev resolves @aparte/* from source (HMR, no rebuild) via the workspace's
// `@aparte-workspace/source` export condition — mirrors apps/docs. The production
// build omits it and consumes the published `dist`, like an external consumer.
export default defineConfig(({ mode }) => ({
    base: './',
    ...(mode === 'development'
        ? {
              resolve: {
                  conditions: ['@aparte-workspace/source', 'module', 'browser', 'development|production'],
              },
          }
        : {}),
}));
