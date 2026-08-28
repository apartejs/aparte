// @vitest-environment jsdom
/**
 * The composer's placeholder reaches an input that is already on the page.
 *
 * The input reads the composer's `placeholder` as a fallback when it renders, and the
 * composer's attribute callback for it was an empty branch ("primitives read this
 * directly — no event needed"). So a placeholder bound to a translated string went
 * stale on the first language switch after mount: the composer's attribute changed,
 * the input never looked again.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-composer.js';
import '../aparte-composer-input.js';

afterEach(() => { document.body.innerHTML = ''; });

const shown = (input: Element): string | null => {
    const editor = input.querySelector('.aparte-ci-editor');
    return editor?.getAttribute('data-placeholder') ?? editor?.getAttribute('aria-placeholder') ?? null;
};

describe('composer placeholder', () => {
    it('is pushed to an input already rendered when the composer attribute changes', () => {
        document.body.innerHTML = `<aparte-composer placeholder="Ask anything…"><aparte-composer-input></aparte-composer-input></aparte-composer>`;
        const composer = document.querySelector('aparte-composer')!;
        const input = document.querySelector('aparte-composer-input')!;
        expect(shown(input)).toBe('Ask anything…');

        composer.setAttribute('placeholder', 'Posez votre question…');
        expect(shown(input)).toBe('Posez votre question…');
    });

    it('never overrides a placeholder the input carries itself', () => {
        document.body.innerHTML = `<aparte-composer placeholder="Ask anything…"><aparte-composer-input placeholder="Mine"></aparte-composer-input></aparte-composer>`;
        const composer = document.querySelector('aparte-composer')!;
        const input = document.querySelector('aparte-composer-input')!;
        composer.setAttribute('placeholder', 'Changed');
        expect(shown(input)).toBe('Mine');
    });
});
