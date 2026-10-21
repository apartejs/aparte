// @vitest-environment jsdom
/**
 * The panel gives the focus back.
 *
 * It took focus on open and nothing returned it, so a keyboard user who answered a
 * question was dropped at the top of the document and had to tab through the whole page
 * to reach the composer again — WCAG 2.2 SC 2.4.3, level A, on the human-in-the-loop
 * flow the library puts forward. Searching `packages/core/src` for `previousActive`,
 * `restoreFocus`, `returnFocus` or `document.activeElement` returned exactly one hit,
 * in `aparte-select.ts`, for something else: no restoration existed anywhere in core.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../../composer/aparte-composer.js';
import '../../composer/aparte-composer-input.js';
import '../aparte-elicitation.js';
import { aparteGlobalConfig } from '../../../config/aparte-config';
import { requestUserInput } from '../../../elicitation/index';

/**
 * The composer is authored the way the shell authors it — WITH its input.
 *
 * It used to be an empty `<aparte-composer>`, and that emptiness hid a second theft:
 * closing the panel called `composer.focus()`, which forwards to the composer's input
 * and did nothing at all when there was none. Every assertion below about focus
 * staying put was therefore vacuous on the one path that could move it.
 */
function mountChat(): HTMLButtonElement {
    const host = document.createElement('div');
    const composer = document.createElement('aparte-composer');
    composer.appendChild(document.createElement('aparte-composer-input'));
    host.appendChild(composer);
    host.appendChild(document.createElement('aparte-elicitation'));
    const trigger = document.createElement('button');
    trigger.textContent = 'send';
    host.appendChild(trigger);
    document.body.appendChild(host);
    return trigger;
}

const clickOption = (label: string): void => {
    Array.from(document.querySelectorAll<HTMLButtonElement>('.aparte-elic-panel .aparte-elic-option--command'))
        .find((b) => b.querySelector('.aparte-elic-option-title')?.textContent === label)!
        .click();
};

afterEach(() => {
    aparteGlobalConfig.setElicitationPresenter(null);
    document.body.innerHTML = '';
});

describe('elicitation focus (SC 2.4.3)', () => {
    it('returns the focus to whoever had it when the panel closes', async () => {
        const trigger = mountChat();
        trigger.focus();
        expect(document.activeElement, 'precondition: the trigger holds the focus').toBe(trigger);

        const p = requestUserInput({
            message: 'Framework?',
            schema: { type: 'enum', options: [{ value: 'react' }, { value: 'vue' }], allowOther: false },
        });
        expect(document.activeElement, 'the panel takes the focus on open').not.toBe(trigger);

        clickOption('react');
        await p;

        expect(document.activeElement, 'and hands it back on close').toBe(trigger);
    });

    it('does NOT pull the focus back if the reader has moved on', async () => {
        const trigger = mountChat();
        trigger.focus();
        const p = requestUserInput({
            message: 'Framework?',
            schema: { type: 'enum', options: [{ value: 'react' }, { value: 'vue' }], allowOther: false },
        });

        // The reader clicks away while the request is still open — a late settle must
        // not yank them back. Same theft, opposite direction.
        const elsewhere = document.createElement('input');
        document.body.appendChild(elsewhere);
        elsewhere.focus();

        clickOption('react');
        await p;

        expect(document.activeElement, 'the focus stays where the reader put it').toBe(elsewhere);
    });

    /*
     * The eviction path, which nothing covered.
     *
     * A turn ending closes any open panel (`_handleMessageDone` → `_evictPanel`), and
     * that is not the reader's doing at all: the model finished. Pulling the caret out
     * of whatever they had moved to — another chat's field, a search box, a link they
     * were about to follow — is the same theft as the case above, minus even a click
     * to blame it on.
     */
    it('does not grab the focus when a turn ending evicts the panel', async () => {
        const trigger = mountChat();
        trigger.focus();
        const p = requestUserInput({
            message: 'Framework?',
            schema: { type: 'enum', options: [{ value: 'react' }, { value: 'vue' }], allowOther: false },
        });

        const elsewhere = document.createElement('input');
        document.body.appendChild(elsewhere);
        elsewhere.focus();

        window.dispatchEvent(new CustomEvent('aparte-message-done'));
        await p.catch(() => undefined);

        expect(document.activeElement, 'the model finishing is not a reason to move the caret').toBe(elsewhere);
    });
});

describe('elicitation focus — whose turn it is (#22)', () => {
    it('leaves the focus on a field elsewhere on the page when a script opened the panel', async () => {
        mountChat();
        const elsewhere = document.createElement('input');
        document.body.appendChild(elsewhere);
        elsewhere.focus();
        const p = requestUserInput({
            message: 'Framework?',
            schema: { type: 'enum', options: [{ value: 'react' }, { value: 'vue' }], allowOther: false },
        });
        expect(document.querySelector('.aparte-elic-panel'), 'the panel is shown').not.toBeNull();
        expect(document.activeElement, 'and the focus stays where the reader is').toBe(elsewhere);
        clickOption('react');
        await p;
        expect(document.activeElement).toBe(elsewhere);
    });

    it('takes it when nobody holds the focus — a click in Safari, a screen reader — so the panel is announced', () => {
        mountChat();
        (document.activeElement as HTMLElement | null)?.blur();
        void requestUserInput({
            message: 'Framework?',
            schema: { type: 'enum', options: [{ value: 'react' }, { value: 'vue' }], allowOther: false },
        });
        expect(document.activeElement, 'the panel holds it').not.toBe(document.body);
        expect(document.querySelector('.aparte-elic-panel')?.contains(document.activeElement)).toBe(true);
    });

    it("takes it from a button of the app's own chrome beside the chat — its click started the turn", () => {
        mountChat();
        const appButton = document.createElement('button');
        document.body.appendChild(appButton);
        appButton.focus();
        void requestUserInput({
            message: 'Framework?',
            schema: { type: 'enum', options: [{ value: 'react' }, { value: 'vue' }], allowOther: false },
        });
        expect(document.querySelector('.aparte-elic-panel')?.contains(document.activeElement)).toBe(true);
    });

    it("from the chat's own editor it focuses the panel itself, so the next Enter does not pick an option", () => {
        mountChat();
        const editor = document.querySelector<HTMLElement>('aparte-composer-input textarea, aparte-composer-input [contenteditable]')
            ?? document.querySelector<HTMLElement>('aparte-composer-input')!;
        if (!editor.hasAttribute('tabindex') && editor.tagName === 'APARTE-COMPOSER-INPUT') editor.setAttribute('tabindex', '0');
        const field = document.createElement('textarea');
        document.querySelector('aparte-composer')!.prepend(field);
        field.focus();
        void requestUserInput({
            message: 'Framework?',
            schema: { type: 'enum', options: [{ value: 'react' }, { value: 'vue' }], allowOther: false },
        });
        const panel = document.querySelector<HTMLElement>('.aparte-elic-panel')!;
        expect(document.activeElement, 'the panel, not one of its options').toBe(panel);
        expect(panel.getAttribute('aria-label')).toBe('Framework?');
    });

    it('says a question waits when the reader is busy elsewhere', async () => {
        mountChat();
        const elsewhere = document.createElement('input');
        document.body.appendChild(elsewhere);
        elsewhere.focus();
        void requestUserInput({
            message: 'Framework?',
            schema: { type: 'enum', options: [{ value: 'react' }, { value: 'vue' }], allowOther: false },
        });
        await new Promise((r) => setTimeout(r, 80));
        expect(document.querySelector('.aparte-elic-status[role="status"]')?.textContent).toBe('Framework?');
        expect(document.activeElement).toBe(elsewhere);
    });

    it('counts a field inside a shadow root outside the chat as busy elsewhere', () => {
        mountChat();
        const host = document.createElement('div');
        document.body.appendChild(host);
        const field = host.attachShadow({ mode: 'open' }).appendChild(document.createElement('input'));
        field.focus();
        void requestUserInput({
            message: 'Framework?',
            schema: { type: 'enum', options: [{ value: 'react' }, { value: 'vue' }], allowOther: false },
        });
        expect(document.activeElement, 'still the shadow host').toBe(host);
        expect(host.shadowRoot!.activeElement).toBe(field);
    });

    it('taken from nobody, the focus goes to the composer when the panel closes, not back to <body>', async () => {
        mountChat();
        (document.activeElement as HTMLElement | null)?.blur();
        const p = requestUserInput({
            message: 'Framework?',
            schema: { type: 'enum', options: [{ value: 'react' }, { value: 'vue' }], allowOther: false },
        });
        clickOption('react');
        await p;
        expect(document.activeElement).not.toBe(document.body);
        expect(document.querySelector('aparte-composer')!.contains(document.activeElement)).toBe(true);
    });
});

