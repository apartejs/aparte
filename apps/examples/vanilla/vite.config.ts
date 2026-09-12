import { fileURLToPath } from 'node:url';
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
                  // The stylesheet too: a CSS @import of a bare specifier does not go
                  // through the conditions above, so without this line style.css would
                  // pull the BUILT dist/index.css (stale on anything edited since the
                  // last build) while main.ts ran on source. One alias, same source as
                  // the JS. Production has no alias and resolves the package's default.
                  alias: [{ find: '@aparte/core/styles.css', replacement: fileURLToPath(new URL('../../../packages/core/src/styles/bundle.css', import.meta.url)) }],
              },
          }
        : {}),
}));
