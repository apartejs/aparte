// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';

/**
 * A locale switch is documented as LIVE. From the localization guide, verbatim:
 * "A locale switch is live: mounted components re-render immediately" — with a
 * language-toggle example — and `setLocale` says the same in its own comment,
 * which is why it calls `_notify()`.
 *
 * It kept only half of that. `setLocale` did notify; the components ignored most
 * of it, so a switch left a BILINGUAL interface: the action-bar labels changed
 * language while the bubble's name still read "You", the branch arrows kept their
 * old `aria-label`, and a chat already mounted never flipped to RTL. Only a reload
 * fixed it, because a reload rebuilds the elements.
 *
 * These are the strings a switch has to reach. One file, because the promise is
 * one sentence: what is mounted follows the locale.
 */

import '../../components/bubble/aparte-chat-bubble.js';
import '../../components/composer/aparte-composer.js';
import '../../components/viewport/aparte-chat-viewport.js';
import '../../components/conversation-list/aparte-conversation-list.js';
import { AparteConfig } from '../aparte-config.js';
import { APARTE_DEFAULT_LOCALE, type AparteLocale } from '../locale.js';

/** A locale that differs in every string this file asserts on. */
const FR: AparteLocale = {
    ...APARTE_DEFAULT_LOCALE,
    roleNameUser: 'Vous',
    roleNameAssistant: 'Assistant IA',
    previousResponse: 'Réponse précédente',
    nextResponse: 'Réponse suivante',
    messageActions: 'Actions du message',
    typing: 'Écrit…',
};

/** Same, plus a right-to-left reading direction. */
const AR: AparteLocale = { ...APARTE_DEFAULT_LOCALE, direction: 'rtl', roleNameUser: 'أنت' };

const mounted: HTMLElement[] = [];
function mount<T extends HTMLElement>(tag: string, attrs: Record<string, string> = {}): T {
    const el = document.createElement(tag) as T;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    mounted.push(el);
    return el;
}

afterEach(() => {
    while (mounted.length) mounted.pop()!.remove();
    document.body.innerHTML = '';
    AparteConfig.reset();
});

describe('a live locale switch reaches a mounted bubble', () => {
    it('renames it — the symptom that started this: the bubble still said "You"', () => {
        const bubble = mount('aparte-chat-bubble', { role: 'user', 'message-id': 'u1' });
        expect(bubble.querySelector('.aparte-name')?.textContent).toBe('You');

        AparteConfig.setLocale(FR);

        expect(bubble.querySelector('.aparte-name')?.textContent).toBe('Vous');
    });

    it('renames an assistant bubble too, and switches back on resetLocale()', () => {
        const bubble = mount('aparte-chat-bubble', { role: 'assistant', 'message-id': 'a1' });

        AparteConfig.setLocale(FR);
        expect(bubble.querySelector('.aparte-name')?.textContent).toBe('Assistant IA');

        AparteConfig.resetLocale();
        expect(bubble.querySelector('.aparte-name')?.textContent).toBe('Assistant');
    });

    it('leaves an explicit name attribute alone — the app outranks the locale', () => {
        const bubble = mount('aparte-chat-bubble', { role: 'user', 'message-id': 'u2', name: 'Paul' });

        AparteConfig.setLocale(FR);

        expect(bubble.querySelector('.aparte-name')?.textContent).toBe('Paul');
    });

    it('re-labels the branch arrows and the action toolbar (announced strings)', () => {
        const bubble = mount('aparte-chat-bubble', { role: 'assistant', 'message-id': 'a2' });

        AparteConfig.setLocale(FR);

        expect(bubble.querySelector('.aparte-branch-prev')?.getAttribute('aria-label'))
            .toBe('Réponse précédente');
        expect(bubble.querySelector('.aparte-branch-next')?.getAttribute('aria-label'))
            .toBe('Réponse suivante');
        expect(bubble.querySelector('.aparte-action-bar')?.getAttribute('aria-label'))
            .toBe('Actions du message');
    });

    it('re-labels the waiting indicator a screen reader is reading right now', () => {
        const bubble = mount('aparte-chat-bubble', { role: 'assistant', 'message-id': 'a3', streaming: '' });
        expect(bubble.querySelector('.aparte-waiting')?.textContent).toContain('Typing...');

        AparteConfig.setLocale(FR);

        expect(bubble.querySelector('.aparte-waiting')?.textContent).toContain('Écrit…');
    });
});

describe('a live locale switch reaches a mounted viewport', () => {
    it('flips the reading direction to RTL without a reload', () => {
        const vp = mount('aparte-chat-viewport');
        const container = vp.querySelector('.aparte-viewport-container')!;
        expect(container.getAttribute('dir')).toBe('ltr');

        AparteConfig.setLocale(AR);

        expect(vp.querySelector('.aparte-viewport-container')!.getAttribute('dir')).toBe('rtl');
    });

    it('and back to LTR', () => {
        const vp = mount('aparte-chat-viewport');
        AparteConfig.setLocale(AR);
        AparteConfig.resetLocale();
        expect(vp.querySelector('.aparte-viewport-container')!.getAttribute('dir')).toBe('ltr');
    });
});

describe('a live locale switch reaches a mounted composer', () => {
    /**
     * The direction stopped at the transcript: `dir` was applied by the viewport only,
     * so an RTL locale flipped the conversation and left the composer left-to-right —
     * input, send button and toolbar all on the wrong side. It is also what makes the
     * toolbar's documented placement idiom (`margin-inline-start: auto`) actually work:
     * a logical property in a subtree that inherits no direction is a no-op.
     */
    it('flips the composer to RTL without a reload', () => {
        const composer = mount('aparte-composer');
        expect(composer.getAttribute('dir')).toBe('ltr');

        AparteConfig.setLocale(AR);

        expect(composer.getAttribute('dir')).toBe('rtl');
    });

    it('and back to LTR', () => {
        const composer = mount('aparte-composer');
        AparteConfig.setLocale(AR);
        AparteConfig.resetLocale();
        expect(composer.getAttribute('dir')).toBe('ltr');
    });

    it('carries the direction to a toolbar inside it — the row the idiom targets', () => {
        const composer = mount('aparte-composer');
        const toolbar = document.createElement('aparte-composer-toolbar');
        composer.appendChild(toolbar);

        AparteConfig.setLocale(AR);

        // Inherited, not stamped per element: one attribute on the composer is the
        // whole mechanism, so anything the consumer puts in the row follows.
        expect(composer.getAttribute('dir')).toBe('rtl');
        expect(toolbar.closest('[dir="rtl"]')).toBe(composer);
    });
});

describe('a live locale switch reaches a mounted conversation list', () => {
    /** The delete button's accessible name comes straight from the locale. */
    const deleteLabelOf = (el: HTMLElement): string | null | undefined =>
        el.querySelector('.aparte-conv-item__delete')?.getAttribute('aria-label');

    it('re-labels its rows', () => {
        const list = mount<HTMLElement & { conversations: unknown[] }>('aparte-conversation-list');
        list.conversations = [{ id: 'c1', title: 'Une conversation', updatedAt: 1 }];
        expect(deleteLabelOf(list)).toBe(APARTE_DEFAULT_LOCALE.deleteConversation);

        AparteConfig.setLocale({ ...FR, deleteConversation: 'Supprimer la conversation' });

        expect(deleteLabelOf(list)).toBe('Supprimer la conversation');
    });

    it('re-labels an untitled row, whose title IS a locale string', () => {
        const list = mount<HTMLElement & { conversations: unknown[] }>('aparte-conversation-list');
        list.conversations = [{ id: 'c1', title: '', updatedAt: 1 }];
        expect(list.textContent).toContain(APARTE_DEFAULT_LOCALE.newChat);

        AparteConfig.setLocale({ ...FR, newChat: 'Nouvelle discussion' });

        expect(list.textContent).toContain('Nouvelle discussion');
    });
});
