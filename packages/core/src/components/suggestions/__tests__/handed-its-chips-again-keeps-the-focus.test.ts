/**
 * A wrapper hands the chips again on every render of the app around it, often as the very array
 * the element holds. The chip the keyboard is on stays focused, and the row keeps its scroll.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../../../index.js';
import type { AparteSuggestions } from '../aparte-suggestions.js';

afterEach(() => {
    document.body.replaceChildren();
});

function mount(suggestions: string[]): AparteSuggestions {
    const el = document.createElement('aparte-suggestions') as AparteSuggestions;
    document.body.append(el);
    el.suggestions = suggestions;
    return el;
}

const chips = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>('.aparte-suggestion')];

describe('chips handed again', () => {
    it('keep the focus on the chip it was on, given the same array', () => {
        const list = ['Plan a trip', 'Write a haiku', 'Explain a bug'];
        const el = mount(list);
        chips(el)[1]!.focus();
        expect(document.activeElement).toBe(chips(el)[1]);
        el.suggestions = list;
        expect(document.activeElement).toBe(chips(el)[1]);
    });

    it('keep the focus on the same chip given an equal new array, and draw a mutated one', () => {
        const list = ['Plan a trip', 'Write a haiku'];
        const el = mount(list);
        chips(el)[1]!.focus();
        el.suggestions = ['Plan a trip', 'Write a haiku'];
        expect(document.activeElement).toBe(chips(el)[1]);
        list.push('Explain a bug');
        el.suggestions = list;
        expect(chips(el).map((c) => c.textContent)).toEqual(['Plan a trip', 'Write a haiku', 'Explain a bug']);
        expect(document.activeElement?.textContent).toBe('Write a haiku');
    });

    it('keep the row where it was scrolled', () => {
        const el = mount(['a', 'b', 'c']);
        const row = el.querySelector<HTMLElement>('.aparte-suggestions')!;
        row.scrollLeft = 40;
        el.suggestions = ['a', 'b', 'c'];
        expect(el.querySelector<HTMLElement>('.aparte-suggestions')!.scrollLeft).toBe(row.scrollLeft);
    });
});
