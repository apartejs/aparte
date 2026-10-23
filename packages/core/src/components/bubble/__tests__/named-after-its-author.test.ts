// @vitest-environment jsdom
/**
 * A message is named after its author when the bubble carries one.
 *
 * The accessible name followed the role alone, so every assistant-side bubble was
 * "Assistant response" — a human agent answering on that side included — while the page
 * showed that person's name above it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat-bubble.js';
import { aparteGlobalConfig } from '../../../config/index.js';

function mount(role: 'user' | 'assistant', name?: string): HTMLElement {
    const el = document.createElement('aparte-chat-bubble');
    el.setAttribute('data-role', role);
    el.setAttribute('message-id', 'm1');
    if (name) el.setAttribute('name', name);
    document.body.appendChild(el);
    return el;
}

const label = (el: HTMLElement): string | null => el.querySelector('.aparte-message')!.getAttribute('aria-label');

afterEach(() => { document.body.innerHTML = ''; aparteGlobalConfig.reset(); });

describe('the accessible name of a message', () => {
    it('is its author when the bubble has a name', () => {
        expect(label(mount('assistant', 'Camille (support)'))).toBe('Message from Camille (support)');
    });

    it('keeps a name with a dollar sign as it is written', () => {
        // `String.replace` reads `$&`, `$'` and `$$` in its replacement: a display name is
        // free text, and "A$&B" came out as "Message from A{name}B".
        expect(label(mount('assistant', "A$&B $' $$"))).toBe("Message from A$&B $' $$");
    });

    it('follows a name set or changed after the bubble is drawn', () => {
        const el = mount('assistant');
        expect(label(el)).toBe('Assistant response');
        el.setAttribute('name', 'Camille');
        expect(label(el)).toBe('Message from Camille');
    });

    it('is the role without a name, and both read the locale', () => {
        expect(label(mount('user'))).toBe('Your message');
        aparteGlobalConfig.setLocale({ ...aparteGlobalConfig.getLocale(), messageFrom: 'Message de {name}' });
        expect(label(mount('assistant', 'Camille'))).toBe('Message de Camille');
    });
});
