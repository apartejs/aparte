import { describe, it, expect } from 'vitest';
import { aparteGlobalConfig, AparteConfig } from '@aparte/core';
import { setupMarkedProvider } from './index.js';

/**
 * A plugin can be scoped to ONE chat.
 *
 * All four wrappers expose a `config` prop and document it as "several
 * independently-configured chats can coexist on one page". The components honour it
 * — but no `setup*` accepted a config, so every plugin wrote to the global
 * singleton. The advertised capability was therefore only ever true for what core
 * registers itself: chat A with marked and chat B without was impossible, and the
 * last `setup*` call won for the whole page.
 */
describe('setupMarkedProvider — per-instance config', () => {
    it('configures only the instance it was given', () => {
        const scoped = new AparteConfig();
        const other = new AparteConfig();

        setupMarkedProvider(undefined, scoped);

        expect(scoped.renderMarkdown('**bold**')).toContain('<strong>');
        expect(
            other.renderMarkdown('**bold**'),
            'the other chat on the page was configured too',
        ).not.toContain('<strong>');
    });

    it('still defaults to the global config, so existing callers are unaffected', () => {
        aparteGlobalConfig.reset();
        setupMarkedProvider();
        expect(aparteGlobalConfig.renderMarkdown('**bold**')).toContain('<strong>');
        aparteGlobalConfig.reset();
    });
});
