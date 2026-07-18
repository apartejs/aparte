import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev resolves @aparte/* from source (HMR); the production build consumes the
// published `dist`. Mirrors apps/docs.
export default defineConfig(({ mode }) => ({
    base: './',
    plugins: [react()],
    resolve: {
        // Dedupe React so the source-consumed @aparte/react wrapper and the app
        // share ONE React instance (else "Invalid hook call" → blank page).
        dedupe: ['react', 'react-dom'],
        ...(mode === 'development'
            ? { conditions: ['@aparte-workspace/source', 'module', 'browser', 'development|production'] }
            : {}),
    },
}));
