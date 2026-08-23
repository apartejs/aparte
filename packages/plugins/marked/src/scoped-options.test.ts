// @vitest-environment jsdom
/**
 * `setupMarkedProvider(options, config)` must scope the OPTIONS, not just the
 * provider.
 *
 * The `config` parameter added for per-instance config decided which
 * `AparteConfig` received the `(raw) => string` function. The options went to
 * `marked.use()` — the module-level singleton, cumulative, with no undo. So two
 * chats could have marked-vs-none, but never two different marked configurations,
 * and setting up the SECOND chat retroactively changed the FIRST chat's rendering.
 *
 * The existing scoped-config test covered which config got a provider and could not
 * see this: both providers pointed at the same mutated singleton.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { AparteConfig, aparteGlobalConfig } from '@aparte/core';
import { setupMarkedProvider } from './index.js';

describe('setupMarkedProvider — the options are scoped too', () => {
    afterEach(() => {
        aparteGlobalConfig.reset();
    });

    it('two configs can hold two DIFFERENT marked configurations', () => {
        const withBreaks = new AparteConfig();
        const withoutBreaks = new AparteConfig();

        setupMarkedProvider({ breaks: true }, withBreaks);
        setupMarkedProvider({ breaks: false }, withoutBreaks);

        // A single newline is a <br> only under `breaks: true`.
        const a = withBreaks.renderMarkdown('one\ntwo');
        const b = withoutBreaks.renderMarkdown('one\ntwo');

        expect(a, 'breaks:true turns the newline into a <br>').toContain('<br');
        expect(b, 'breaks:false leaves it as text').not.toContain('<br');
    });

    it('setting up a second config does not retroactively change the first', () => {
        const first = new AparteConfig();
        setupMarkedProvider({ breaks: true }, first);
        const before = first.renderMarkdown('one\ntwo');

        // The regression: this call used to reach into the shared singleton.
        const second = new AparteConfig();
        setupMarkedProvider({ breaks: false }, second);

        expect(first.renderMarkdown('one\ntwo'), 'the first config renders as it did').toBe(before);
        expect(before).toContain('<br');
    });

    it('with no options it keeps using the shared parser', () => {
        const plain = new AparteConfig();
        setupMarkedProvider(undefined, plain);
        // Nothing to scope, so nothing is allocated — and it still renders.
        expect(plain.renderMarkdown('**bold**')).toContain('<strong>');
    });
});
