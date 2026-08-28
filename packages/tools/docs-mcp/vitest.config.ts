import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/**/*.{test,spec}.ts'],
        globals: true,
        // Node: the server reads text over fetch and speaks MCP over stdio; no DOM anywhere.
        environment: 'node',
    },
});
