// @vitest-environment jsdom
/**
 * `<aparte-chat submit-on-enter>` reaches the composer it composes (UI audit LOT 9).
 *
 * The four wrappers expose `submitOnEnter`, and each writes it on the composer
 * itself — but the vanilla shell, whose whole point is "the empty tag just works",
 * forwarded `placeholder` and `disabled` only. A page that wanted Enter to break the
 * line had to reach inside for the composer, which the shell's own docs say you do
 * not have to do.
 *
 * Relayed by VALUE, never by presence: `submit-on-enter="false"` is the meaningful
 * spelling (the bare attribute means the default, ON), so mirroring `hasAttribute`
 * would have turned "false" into "true".
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat.js';
import '../../viewport/aparte-chat-viewport.js';
import '../../composer/aparte-composer.js';
import { AparteChat } from '../aparte-chat.js';
import type { AparteComposer } from '../../composer/aparte-composer.js';

afterEach(() => { document.body.innerHTML = ''; });

function mount(attrs: Record<string, string> = {}): { chat: AparteChat; composer: AparteComposer } {
    const chat = document.createElement('aparte-chat') as AparteChat;
    for (const [k, v] of Object.entries(attrs)) chat.setAttribute(k, v);
    document.body.appendChild(chat);
    const composer = chat.querySelector('aparte-composer') as AparteComposer;
    expect(composer, 'the default composition must include a composer').toBeTruthy();
    return { chat, composer };
}

describe('<aparte-chat submit-on-enter>', () => {
    it('is observed', () => {
        expect(AparteChat.observedAttributes).toContain('submit-on-enter');
    });

    it('"false" in the initial markup reaches the composer: Enter breaks the line', () => {
        const { composer } = mount({ 'submit-on-enter': 'false' });
        expect(composer.getAttribute('submit-on-enter')).toBe('false');
        expect(composer.submitOnEnter).toBe(false);
    });

    it('left unset, the composer keeps its default (Enter sends)', () => {
        const { composer } = mount();
        expect(composer.hasAttribute('submit-on-enter')).toBe(false);
        expect(composer.submitOnEnter).toBe(true);
    });

    it('toggled after mount, the composer follows by value, and a removal mirrors through', () => {
        const { chat, composer } = mount();
        chat.setAttribute('submit-on-enter', 'false');
        expect(composer.submitOnEnter).toBe(false);
        chat.setAttribute('submit-on-enter', '');
        expect(composer.submitOnEnter).toBe(true);
        chat.removeAttribute('submit-on-enter');
        expect(composer.hasAttribute('submit-on-enter')).toBe(false);
    });
});
