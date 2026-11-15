/**
 * A registered message action that an icon cannot say ("Go back before", "Branch") shows its
 * label as its text, and can stand before the built-in buttons.
 *
 * `display` picks what the button shows: the icon alone (the bar's look, the default), the
 * label alone, or both. A button showing its label has that label as its name: no
 * `aria-label` repeating it, and no tooltip saying what is already written. `position` puts
 * the action before the built-ins or after them, and `order` sorts within each side. `label`
 * is a locale key when the locale has it, so the words follow the chat's language.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat-bubble.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';

const mount = (role: 'user' | 'assistant' = 'user'): HTMLElement => {
    const bubble = document.createElement('aparte-chat-bubble');
    bubble.setAttribute('data-role', role);
    bubble.setAttribute('message-id', 'm1');
    document.body.appendChild(bubble);
    return bubble;
};

const button = (bubble: HTMLElement, id: string) => bubble.querySelector<HTMLButtonElement>(`[data-action="custom:${id}"]`)!;
const order = (bubble: HTMLElement) => [...bubble.querySelectorAll<HTMLElement>('.aparte-action-bar > button')].map((b) => b.dataset['action']);

afterEach(() => {
    document.body.innerHTML = '';
    aparteGlobalConfig.reset();
});

describe('a registered action', () => {
    it('is an icon by default, named by its label', () => {
        aparteGlobalConfig.registerAction({ id: 'share', icon: '<svg class="i"></svg>', label: 'Share', zones: ['bubble'] });
        const share = button(mount(), 'share');
        expect(share.classList.contains('aparte-btn--icon')).toBe(true);
        expect(share.getAttribute('aria-label')).toBe('Share');
        expect(share.getAttribute('title')).toBe('Share');
        expect(share.textContent).toBe('');
    });

    it('shows its label as its text, with no icon to give', () => {
        aparteGlobalConfig.registerAction({ id: 'rewind', label: 'Go back before', display: 'label', zones: ['bubble'] });
        const rewind = button(mount(), 'rewind');
        expect(rewind.textContent).toBe('Go back before');
        expect(rewind.classList.contains('aparte-btn--icon')).toBe(false);
        expect(rewind.querySelector('svg')).toBeNull();
        // The text is its name: nothing says it twice.
        expect(rewind.hasAttribute('aria-label')).toBe(false);
        expect(rewind.hasAttribute('title')).toBe(false);
    });

    it('shows its icon, then its label', () => {
        aparteGlobalConfig.registerAction({ id: 'branch', icon: '<svg class="i"></svg>', label: 'Branch', display: 'both', zones: ['bubble'] });
        const branch = button(mount(), 'branch');
        expect(branch.firstElementChild?.matches('svg.i')).toBe(true);
        expect(branch.textContent).toBe('Branch');
        expect(branch.classList.contains('aparte-btn--icon')).toBe(false);
        expect(branch.hasAttribute('aria-label')).toBe(false);
    });

    it('with no icon to draw, shows its label rather than an empty button', () => {
        aparteGlobalConfig.registerAction({ id: 'pin', label: 'Pin', zones: ['bubble'] });
        const pin = button(mount(), 'pin');
        expect(pin.textContent).toBe('Pin');
        expect(pin.classList.contains('aparte-btn--icon')).toBe(false);
    });

    it('stands before the built-in buttons at the start, after them by default, sorted by order on each side', () => {
        aparteGlobalConfig.setBubbleActions({ copy: true, edit: true });
        aparteGlobalConfig.registerAction({ id: 'branch', label: 'Branch', display: 'label', position: 'start', order: 2, zones: ['bubble'] });
        aparteGlobalConfig.registerAction({ id: 'rewind', label: 'Go back before', display: 'label', position: 'start', order: 1, zones: ['bubble'] });
        aparteGlobalConfig.registerAction({ id: 'share', icon: '<svg></svg>', label: 'Share', zones: ['bubble'] });
        expect(order(mount())).toEqual(['custom:rewind', 'custom:branch', 'copy', 'edit', 'custom:share']);
    });

    it('a start action keeps its place when the bar is drawn again', () => {
        aparteGlobalConfig.setBubbleActions({ copy: true });
        aparteGlobalConfig.registerAction({ id: 'rewind', label: 'Go back before', display: 'label', position: 'start', zones: ['bubble'] });
        const bubble = mount();
        aparteGlobalConfig.setBubbleActions({ copy: true, edit: true });
        expect(order(bubble)).toEqual(['custom:rewind', 'copy', 'edit']);
    });

    it("reads its label as a locale key when the locale has it, and follows the chat's language", () => {
        aparteGlobalConfig.extendLocale({ goBackBefore: 'Go back before' });
        aparteGlobalConfig.registerAction({ id: 'rewind', label: 'goBackBefore', display: 'label', zones: ['bubble'] });
        aparteGlobalConfig.registerAction({ id: 'share', icon: '<svg></svg>', label: 'goBackBefore', zones: ['bubble'] });
        const bubble = mount();
        expect(button(bubble, 'rewind').textContent).toBe('Go back before');
        expect(button(bubble, 'share').getAttribute('aria-label')).toBe('Go back before');

        aparteGlobalConfig.extendLocale({ goBackBefore: 'Revenir avant' });
        expect(button(bubble, 'rewind').textContent).toBe('Revenir avant');
        expect(button(bubble, 'share').getAttribute('aria-label')).toBe('Revenir avant');
    });

    it('a label the locale does not have is shown as written', () => {
        aparteGlobalConfig.registerAction({ id: 'rewind', label: 'Go back before', display: 'label', zones: ['bubble'] });
        expect(button(mount(), 'rewind').textContent).toBe('Go back before');
    });
});
