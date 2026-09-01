// @vitest-environment jsdom
/**
 * The error segment wears the alert recipe — the frame AND the parts (UI audit, visual
 * half — LOT 29).
 *
 * The renderer put `aparte-alert aparte-alert--danger` on its root and then redrew every
 * part under classes of its own (`aparte-error-icon-wrapper`, `-content`, `-title`,
 * `-message`): none of the recipe's part tokens reached it, its icon was a 20px literal
 * among derived tokens (1.8× the title's cap height), and its details rule ran inside the
 * text column, inset on one side and flush on the other. A component wears the recipe;
 * it does not redraw it. What stays the segment's own is the one part the alert has no
 * word for — the details block — under the segment's own name.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import '../../components/bubble/aparte-chat-bubble.js';
import type { AparteSegment } from '../../types/index.js';

type BubbleEl = HTMLElement & { setSegments(segments: AparteSegment[]): void };

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const errorSheet = strip(readFileSync(resolve(process.cwd(), 'src/styles/segment/error.css'), 'utf8'));
const errorRenderer = readFileSync(resolve(process.cwd(), 'src/renderers/segments/error.ts'), 'utf8');

afterEach(() => { document.body.innerHTML = ''; });

function mount(segment: AparteSegment): HTMLElement {
    const bubble = document.createElement('aparte-chat-bubble') as BubbleEl;
    bubble.setAttribute('data-role', 'assistant');
    bubble.setAttribute('message-id', 'a1');
    document.body.appendChild(bubble);
    bubble.setSegments([segment]);
    return bubble.querySelector('.aparte-segment-error') as HTMLElement;
}

describe('the error segment', () => {
    it('is an alert, parts included', () => {
        const el = mount({ id: 'e', type: 'error', content: 'The model timed out.', details: 'ETIMEDOUT after 30s' } as AparteSegment);
        expect(el.classList.contains('aparte-alert')).toBe(true);
        expect(el.classList.contains('aparte-alert--danger')).toBe(true);
        expect(el.querySelector('.aparte-alert__icon svg')).toBeTruthy();
        expect(el.querySelector('.aparte-alert__body > .aparte-alert__title')?.textContent).toBe('Error');
        expect(el.querySelector('.aparte-alert__body > .aparte-alert__message')?.textContent).toBe('The model timed out.');
        expect(el.querySelector('.aparte-alert__body > .aparte-segment-error__details')?.textContent).toBe('ETIMEDOUT after 30s');
    });

    it('emits no private part class, and its sheet draws none', () => {
        expect(errorRenderer).not.toMatch(/aparte-error-(?:icon-wrapper|content|title|message|details)/);
        expect(errorSheet).not.toMatch(/\.aparte-error-/);
    });

    it('keeps only what the alert has no word for: the details block', () => {
        expect(errorSheet).toMatch(/\.aparte-segment-error__details\s*\{/);
    });
});
