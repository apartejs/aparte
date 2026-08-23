// @vitest-environment jsdom
/**
 * The send button while a question is open.
 *
 * The composer's one button has three meanings: send a message, stop a turn, submit
 * an answer. It already switched its accessible label to "Submit" when a panel took
 * over the composer — and kept drawing a paper plane, so it *read* as "send a
 * message" while it *meant* "answer this question". Reported as "l'envoi via le
 * bouton d'envoi est bizarre", and the fix is not a second button: adding a submit
 * inside the panel would put two of them on screen, which is worse than the
 * reference implementations, not better. A button must not lie about what it does.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-composer.js';
import '../aparte-composer-send.js';
import { aparteGlobalConfig } from '../../../config/index.js';
import type { AparteComposer } from '../aparte-composer.js';

function mount(): { composer: AparteComposer; button: HTMLButtonElement } {
    const composer = document.createElement('aparte-composer') as AparteComposer;
    document.body.appendChild(composer);
    const send = document.createElement('aparte-composer-send');
    composer.appendChild(send);
    return { composer, button: send.querySelector('button')! };
}

/** A panel, as the elicitation presenter mounts one. */
function panel(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'aparte-elic-panel';
    return el;
}

describe('<aparte-composer-send> while a panel is open', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        aparteGlobalConfig.reset();
    });

    it('shows a different icon than sending a message', () => {
        // Distinguishable icons are the whole point; which glyph is the icon
        // provider's business, so the assertion is that they DIFFER.
        aparteGlobalConfig.setIconProvider({
            send: () => '<svg data-icon="send"></svg>',
            check: () => '<svg data-icon="check"></svg>',
        });
        const { composer, button } = mount();
        const sending = button.innerHTML;

        composer.showPanel(panel(), { submitEnabled: true });

        expect(button.innerHTML, 'the icon has to change with the meaning').not.toBe(sending);
        expect(button.innerHTML).toContain('data-icon="check"');
    });

    it('says Submit, not Send — from a locale key that now exists', () => {
        // `t('submitButton')` had been read since the panel API existed and never
        // declared, so it returned '' and the hardcoded fallback showed. A key read
        // and never declared is worse than a literal: it looks translated.
        const { composer, button } = mount();
        composer.showPanel(panel(), { submitEnabled: true });
        expect(button.getAttribute('aria-label')).toBe('Submit');
        expect(button.getAttribute('title')).toBe('Submit');
    });

    it('is disabled until the panel says the answer is usable', () => {
        const { composer, button } = mount();
        composer.showPanel(panel(), { submitEnabled: false });
        expect(button.disabled).toBe(true);

        composer.setPanelSubmitEnabled(true);
        expect(button.disabled).toBe(false);
    });

    it('goes back to sending a message when the panel closes', () => {
        aparteGlobalConfig.setIconProvider({
            send: () => '<svg data-icon="send"></svg>',
            check: () => '<svg data-icon="check"></svg>',
        });
        const { composer, button } = mount();
        const sending = button.innerHTML;

        composer.showPanel(panel(), { submitEnabled: true });
        composer.hidePanel();

        expect(button.innerHTML, 'the composer is a composer again').toBe(sending);
    });

    it('still draws something when the consumer\'s icon set has no check', () => {
        // `getIcon` returns a built-in when the provider has no entry for a name, so
        // the button can never come out empty. This is written down because the first
        // version of the code guarded against it with a `||` fallback chain that could
        // not run — dead code born of an assumption, deleted once measured.
        aparteGlobalConfig.setIconProvider({ send: () => '<svg data-icon="send"></svg>' });
        const { composer, button } = mount();
        composer.showPanel(panel(), { submitEnabled: true });

        expect(button.innerHTML.trim()).not.toBe('');
        expect(button.innerHTML, 'the built-in, not the send icon').not.toContain('data-icon="send"');
        expect(button.getAttribute('aria-label')).toBe('Submit');
    });
});
