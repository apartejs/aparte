import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Headless by default — pure Node. The suites that drive core's DOM-coupled
        // `_streamLoop` override this per-file via a `// @vitest-environment jsdom`
        // pragma.
        include: ['src/**/*.{test,spec}.ts'],
        globals: true,
        environment: 'node',
        // `@aparte/core` resolves from SOURCE (the condition below), not from its
        // built dist. Two reasons, both learned the hard way:
        //
        //  - Coverage. The parity suite is the only thing that exercises core's
        //    `_streamLoop` end to end, and against dist it credited that work to a
        //    built artifact — so the gated number for `aparte-client.ts` reflected
        //    neither the file nor the suite, and could not be used to reason about
        //    where the risk was.
        //  - It lies about the working tree. Editing core and re-running these tests
        //    silently exercised the OLD code until someone remembered to build. That
        //    cost a full debugging cycle on the tool-timeout parity scenario: the
        //    option under test existed in source and not in dist.
        //
        // Inlined so Vite (not Node) does the resolving, which is what honours the
        // condition instead of the externalised `node` one. Same mechanism as
        // `packages/providers/ai/openai-compat/vitest.config.ts`.
        server: { deps: { inline: ['@aparte/core'] } },
    },
    resolve: {
        conditions: ['@aparte-workspace/source', 'module', 'browser', 'development'],
    },
});
