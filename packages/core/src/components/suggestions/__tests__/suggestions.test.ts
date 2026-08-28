// @vitest-environment jsdom
/**
 * <aparte-suggestions> — prompt starters that go THROUGH the composer.
 *
 * The composer's `submit()` is where every gate lives, so a starter fills the composer
 * and submits it rather than dispatching a synthetic `aparte-send`; the example app
 * learned that the hard way (chips live while the composer was greyed out). The
 * composer here is a stand-in with the two methods the element calls, which is also
 * the contract: `setValue()` then `submit()` — or `focus()` in `fill` mode.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '../aparte-suggestions.js';
import type { AparteSuggestions, AparteSuggestionEventDetail } from '../aparte-suggestions.js';

type FakeComposer = HTMLElement & { setValue: ReturnType<typeof vi.fn>; submit: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn> };

const fakeComposer = (attrs: Record<string, string> = {}): FakeComposer => {
    // Through `unknown`: the tag-name map types this element as the real composer,
    // whose methods are not mocks — and the stand-in's whole point is that they are.
    const el = document.createElement('aparte-composer') as unknown as FakeComposer;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.setValue = vi.fn();
    el.submit = vi.fn();
    el.focus = vi.fn();
    return el;
};

const mount = (html: string): AparteSuggestions => {
    document.body.innerHTML = html;
    return document.querySelector('aparte-suggestions') as AparteSuggestions;
};

const chips = (el: HTMLElement): HTMLButtonElement[] => [...el.querySelectorAll<HTMLButtonElement>('button')];

afterEach(() => { document.body.innerHTML = ''; });

describe('<aparte-suggestions>', () => {
    it('renders one pill per starter, wearing the button recipe, from the JSON attribute', () => {
        const el = mount(`<aparte-suggestions suggestions='["What is aparté?", {"label": "Write a haiku", "prompt": "Write a haiku about web components."}]'></aparte-suggestions>`);
        const buttons = chips(el);
        expect(buttons.map((b) => b.textContent)).toEqual(['What is aparté?', 'Write a haiku']);
        expect(buttons[0]!.className).toBe('aparte-btn aparte-btn--surface aparte-btn--pill aparte-suggestion');
        expect(buttons[0]!.type).toBe('button');
        // The full prompt is on the chip whose label abbreviates it, and only there.
        expect(buttons[0]!.title).toBe('');
        expect(buttons[1]!.title).toBe('Write a haiku about web components.');
        expect(el.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Suggested prompts');
        expect(el.hasAttribute('data-empty')).toBe(false);
    });

    it('takes the property form too, and re-renders on assignment', () => {
        const el = mount(`<aparte-suggestions></aparte-suggestions>`);
        expect(el.hasAttribute('data-empty')).toBe(true);
        el.suggestions = ['One', { label: 'Two' }];
        expect(chips(el).map((b) => b.textContent)).toEqual(['One', 'Two']);
        expect(el.hasAttribute('data-empty')).toBe(false);
    });

    it('warns and renders nothing when the attribute is not a JSON array', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const el = mount(`<aparte-suggestions suggestions="not json"></aparte-suggestions>`);
        expect(chips(el)).toHaveLength(0);
        expect(el.hasAttribute('data-empty')).toBe(true);
        expect(warn).toHaveBeenCalledOnce();
        warn.mockRestore();
    });

    it('a click fills the nearest composer and submits it — in that order', () => {
        const composer = fakeComposer();
        composer.innerHTML = `<aparte-suggestions suggestions='[{"label": "Haiku", "prompt": "Write a haiku."}]'></aparte-suggestions>`;
        document.body.appendChild(composer);
        const calls: string[] = [];
        composer.setValue.mockImplementation((v: string) => calls.push(`setValue:${v}`));
        composer.submit.mockImplementation(() => calls.push('submit'));

        chips(composer)[0]!.click();
        expect(calls).toEqual(['setValue:Write a haiku.', 'submit']);
        expect(composer.focus).not.toHaveBeenCalled();
    });

    it('mode="fill" fills and focuses, and leaves the send to the reader', () => {
        const composer = fakeComposer();
        composer.innerHTML = `<aparte-suggestions mode="fill" suggestions='["Explain aparté"]'></aparte-suggestions>`;
        document.body.appendChild(composer);
        chips(composer)[0]!.click();
        expect(composer.setValue).toHaveBeenCalledWith('Explain aparté');
        expect(composer.focus).toHaveBeenCalledOnce();
        expect(composer.submit).not.toHaveBeenCalled();
    });

    it('fires a cancelable aparte-suggestion first; preventDefault() keeps the composer untouched', () => {
        const composer = fakeComposer();
        composer.innerHTML = `<aparte-suggestions suggestions='[{"label": "Haiku", "prompt": "Write a haiku."}]'></aparte-suggestions>`;
        document.body.appendChild(composer);
        let seen: AparteSuggestionEventDetail | null = null;
        document.addEventListener('aparte-suggestion', (e) => { seen = e.detail; e.preventDefault(); }, { once: true });

        chips(composer)[0]!.click();
        expect(seen).toEqual({ label: 'Haiku', prompt: 'Write a haiku.' });
        expect(composer.setValue).not.toHaveBeenCalled();
        expect(composer.submit).not.toHaveBeenCalled();
    });

    it('empty-only hides the row once its composer has sent something', () => {
        const composer = fakeComposer();
        composer.innerHTML = `<aparte-suggestions empty-only suggestions='["Hi"]'></aparte-suggestions>`;
        document.body.appendChild(composer);
        const el = composer.querySelector('aparte-suggestions') as AparteSuggestions;
        expect(el.hidden).toBe(false);
        composer.dispatchEvent(new CustomEvent('aparte-send', { bubbles: true }));
        expect(el.hidden).toBe(true);
    });

    it('outside any composer, target names the chat and the composer pointing at it is used', () => {
        const other = fakeComposer({ target: 'chat-a' });
        const mine = fakeComposer({ target: 'chat-b' });
        document.body.append(other, mine);
        const el = document.createElement('aparte-suggestions') as AparteSuggestions;
        el.setAttribute('target', 'chat-b');
        el.suggestions = ['Go'];
        document.body.appendChild(el);

        chips(el)[0]!.click();
        expect(mine.setValue).toHaveBeenCalledWith('Go');
        expect(mine.submit).toHaveBeenCalledOnce();
        expect(other.setValue).not.toHaveBeenCalled();
    });

    it('warns instead of throwing when no composer exists on the page', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const el = mount(`<aparte-suggestions suggestions='["Alone"]'></aparte-suggestions>`);
        expect(() => chips(el)[0]!.click()).not.toThrow();
        expect(warn).toHaveBeenCalledOnce();
        warn.mockRestore();
    });
});
