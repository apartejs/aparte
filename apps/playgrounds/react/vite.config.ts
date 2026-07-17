import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev resolves @aparte/* from source (HMR); the production build consumes the
// published `dist`. Mirrors apps/docs.
export default defineConfig(({ mode }) => ({
    base: './',
    plugins: [react()],
    ...(mode === 'development'
        ? {
              resolve: {
                  conditions: ['@aparte-workspace/source', 'module', 'browser', 'development|production'],
              },
          }
        : {}),
}));
