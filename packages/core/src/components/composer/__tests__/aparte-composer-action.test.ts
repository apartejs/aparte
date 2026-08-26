// @vitest-environment jsdom
/**
 * `<aparte-composer-action>` — the generic toolbar button.
 *
 * Published, documented, and at 10% function coverage: its only appearance in the
 * suite was a snapshot of exported names. It is the element a consumer reaches for
 * to put their own button in the composer row, so its whole contract is the event
 * it emits and the disabled states it honours — neither of which was exercised.
 *
 * The `aparte-action-click` detail it dispatches had no declared type at all until
 * the event map was completed; these tests pin the shape that type now describes.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import '../aparte-composer.js';
import '../aparte-composer-action.js';
import type { AparteComposer } from '../aparte-composer.js';
import type { AparteActionClickEventDetail } from '../aparte-composer-action.js';

const startTurn = (): void => {
    window.dispatchEvent(new CustomEvent('aparte-message-start', {
        detail: { messageId: 'm1', role: 'assistant' },
    }));
};
const endTurn = (): void => {
    window.dispatchEvent(new CustomEvent('aparte-message-done', {
        detail: { messageId: 'm1', role: 'assistant' },
    }));
};

function mount(attrs: Record<string, string> = {}, composerAttrs: Record<string, string> = {}) {
    const composer = document.createElement('aparte-composer') as AparteComposer;
    for (const [k, v] of Object.entries(composerAttrs)) composer.setAttribute(k, v);
    document.body.appendChild(composer);
    const action = document.createElement('aparte-composer-action');
    for (const [k, v] of Object.entries(attrs)) action.setAttribute(k, v);
    composer.appendChild(action);
    return { composer, action, button: action.querySelector<HTMLButtonElement>('.aparte-composer-action__button')! };
}

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('aparte-composer-action', () => {
    it('labels the button from the `label` attribute', () => {
        const { button } = mount({ label: 'Attach a file' });
        expect(button.getAttribute('aria-label')).toBe('Attach a file');
        expect(button.getAttribute('title')).toBe('Attach a file');
        expect(button.type).toBe('button');
    });

    it('escapes a label that would otherwise break out of the attribute', () => {
        // `label` is host-set and often bound to translated text, so it is
        // attacker-reachable in the same sense any app string is. `check:attr-escaping`
        // enforces the escape statically; this proves the runtime result.
        const { action, button } = mount({ label: '" onfocus="alert(1)' });
        expect(button.getAttribute('aria-label')).toBe('" onfocus="alert(1)');
        expect(button.hasAttribute('onfocus')).toBe(false);
        expect(action.querySelectorAll('button')).toHaveLength(1);
    });

    it('emits aparte-action-click with the action id and its composer', () => {
        const { composer, action, button } = mount({ 'action-id': 'attach' });
        const seen: AparteActionClickEventDetail[] = [];
        // Listening on `document` on purpose: the event is declared composed and
        // bubbling, and the map has to type it there too.
        document.addEventListener('aparte-action-click', (e) => seen.push(e.detail));

        button.click();

        expect(seen).toHaveLength(1);
        expect(seen[0]?.actionId).toBe('attach');
        expect(seen[0]?.composer).toBe(composer);
        void action;
    });

    it('reports an empty actionId rather than undefined when the attribute is absent', () => {
        const { button } = mount();
        const seen: AparteActionClickEventDetail[] = [];
        document.addEventListener('aparte-action-click', (e) => seen.push(e.detail));
        button.click();
        expect(seen[0]?.actionId).toBe('');
    });

    it('renders disabled when the composer is disabled', () => {
        const { button } = mount({}, { disabled: '' });
        expect(button.disabled).toBe(true);
    });

    it('disables itself while a turn streams, and re-enables when it ends', () => {
        const { button } = mount();
        expect(button.disabled).toBe(false);
        startTurn();
        expect(button.disabled).toBe(true);
        endTurn();
        expect(button.disabled).toBe(false);
    });

    it('stays disabled after a turn when its own `disabled` attribute is set', () => {
        // The two conditions are OR-ed in the component; a streaming-change must not
        // clear the consumer's own intent.
        const { button } = mount({ disabled: '' });
        expect(button.disabled).toBe(true);
        startTurn();
        endTurn();
        expect(button.disabled).toBe(true);
    });

    it('mounts standalone without a composer instead of throwing', () => {
        const action = document.createElement('aparte-composer-action');
        action.setAttribute('action-id', 'lonely');
        expect(() => document.body.appendChild(action)).not.toThrow();
        const seen: AparteActionClickEventDetail[] = [];
        document.addEventListener('aparte-action-click', (e) => seen.push(e.detail));
        action.querySelector<HTMLButtonElement>('.aparte-composer-action__button')!.click();
        // Still emits — with a null composer, which is why the detail type declares
        // that field nullable rather than optional.
        expect(seen[0]?.composer).toBeNull();
    });

    it('does not stack a second button when moved between composers', () => {
        const { action } = mount();
        const second = document.createElement('aparte-composer') as AparteComposer;
        document.body.appendChild(second);
        second.appendChild(action);
        expect(action.querySelectorAll('.aparte-composer-action__button')).toHaveLength(1);
    });
});
