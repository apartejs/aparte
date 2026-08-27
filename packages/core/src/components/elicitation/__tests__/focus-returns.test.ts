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
import '../aparte-elicitation.js';
import { aparteGlobalConfig } from '../../../config/aparte-config';
import { requestUserInput } from '../../../elicitation/index';

function mountChat(): HTMLButtonElement {
    const host = document.createElement('div');
    host.appendChild(document.createElement('aparte-composer'));
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
});
