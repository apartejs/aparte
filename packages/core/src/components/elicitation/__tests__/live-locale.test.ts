// @vitest-environment jsdom
/**
 * A language switch while a question is OPEN.
 *
 * Every other live-config consumer in core had this seam; the elicitation panel could
 * not use it, because `Pending` kept only `{ settle, composer }` — nothing held a
 * reference to the panel, so nothing could relabel it. Rebuilding was never the
 * alternative: the reader may be halfway through typing an answer, or three questions
 * into a form, and a rebuild throws that away.
 *
 * So the assertions come in pairs — the strings moved, AND the answer in progress is
 * still there.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-elicitation.js';
import '../../composer/aparte-composer.js';
import '../../composer/aparte-composer-input.js';
import '../../composer/aparte-composer-send.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';
import type { AparteElicitationResult } from '../../../elicitation/types.js';

const FR = () => ({
    ...aparteGlobalConfig.getLocale(),
    elicitationOther: 'Autre…',
    elicitationOtherPlaceholder: 'Écrivez votre réponse…',
    elicitationOtherLabel: 'Réponse libre',
    elicitationYes: 'Oui',
    elicitationNo: 'Non',
    elicitationSkip: 'Passer',
    elicitationAnswerLabel: 'Votre réponse',
});

/** A presenter mounted inside a composer, the way the docs say to wire it. */
function mount() {
    const composer = document.createElement('aparte-composer');
    composer.appendChild(document.createElement('aparte-composer-input'));
    composer.appendChild(document.createElement('aparte-composer-send'));
    const elic = document.createElement('aparte-elicitation');
    composer.appendChild(elic);
    document.body.appendChild(composer);
    return { composer };
}

afterEach(() => { document.body.innerHTML = ''; aparteGlobalConfig.reset(); });

function ask(schema: unknown): Promise<AparteElicitationResult> {
    const present = aparteGlobalConfig.getElicitationPresenter()!;
    return present({ message: 'Pick one', schema: schema as never });
}

describe('a language switch reaches an OPEN question', () => {
    it('a yes/no question moves, and the Skip button with it', async () => {
        mount();
        const answered = ask({ type: 'boolean' });

        const titles = () => [...document.querySelectorAll('.aparte-elic-option-title')]
            .map((n) => n.textContent);
        expect(titles()).toEqual(['Yes', 'No']);

        aparteGlobalConfig.setLocale(FR());

        expect(titles()).toEqual(['Oui', 'Non']);
        expect(document.querySelector('.aparte-elic-skip')!.textContent).toBe('Passer');

        (document.querySelector('.aparte-elic-skip') as HTMLElement).click();
        await expect(answered).resolves.toEqual({ action: 'decline' });
    });

    it('but never a label the tool supplied itself', async () => {
        mount();
        void ask({ type: 'boolean', trueLabel: 'Ship it', falseLabel: 'Hold' });

        aparteGlobalConfig.setLocale(FR());

        // The tool's own copy, in whatever language it chose. A language switch has
        // no business rewriting it — the same rule as a thinking segment's `label`.
        expect([...document.querySelectorAll('.aparte-elic-option-title')].map((n) => n.textContent))
            .toEqual(['Ship it', 'Hold']);
    });

    it('an answer already typed survives the switch', async () => {
        mount();
        void ask({ type: 'string' });

        const input = document.querySelector('.aparte-elic-panel input, .aparte-elic-panel textarea') as HTMLInputElement;
        input.value = 'a half-written answer';
        input.dispatchEvent(new Event('input'));

        aparteGlobalConfig.setLocale(FR());

        // The point of relabelling instead of rebuilding, asserted rather than
        // intended: same node, same value.
        const after = document.querySelector('.aparte-elic-panel input, .aparte-elic-panel textarea') as HTMLInputElement;
        expect(after).toBe(input);
        expect(after.value).toBe('a half-written answer');
        // And its accessible name is still the QUESTION. In the single-field shape the
        // panel's message names the field, so this string belongs to whoever asked —
        // the tool, or the model — and a language switch does not touch it. Asserting
        // the French label here was my mistake, and the code was right.
        expect(after.getAttribute('aria-label')).toBe('Pick one');
    });

    it('the last-resort answer label IS ours, and it moves', async () => {
        mount();
        // No message, so nothing names the field but the locale.
        void (aparteGlobalConfig.getElicitationPresenter()!)({ message: '', schema: { type: 'string' } as never });

        const input = document.querySelector('.aparte-elic-panel input, .aparte-elic-panel textarea')!;
        expect(input.getAttribute('aria-label')).toBe('Your answer');

        aparteGlobalConfig.setLocale(FR());

        expect(input.getAttribute('aria-label')).toBe('Votre réponse');
    });

    it('an "Other…" option carries three strings, and all three move', async () => {
        mount();
        void ask({ type: 'string', enum: ['red', 'green'] });

        const other = document.querySelector('.aparte-elic-other-input') as HTMLInputElement | null;
        if (!other) { expect(other).toBeNull(); return; }   // no free-text fallback in this shape
        expect(other.placeholder).toBe('Type your answer…');

        aparteGlobalConfig.setLocale(FR());

        expect(other.placeholder).toBe('Écrivez votre réponse…');
        expect(other.getAttribute('aria-label')).toBe('Réponse libre');
        expect([...document.querySelectorAll('.aparte-elic-option-title')].map((n) => n.textContent))
            .toContain('Autre…');
    });
});
