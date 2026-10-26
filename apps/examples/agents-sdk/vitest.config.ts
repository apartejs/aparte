import { defineConfig } from 'vitest/config';

/**
 * The server half of the example, tested: the Agents SDK agent served over AG-UI.
 *
 * Fully offline: the real `Runner` and tool, the SDK's own `ScriptedModel` for the words, and
 * aparté's AG-UI runner reading the result through a `fetch` that calls the handler.
 */
export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['server/**/*.test.ts'],
    },
});
