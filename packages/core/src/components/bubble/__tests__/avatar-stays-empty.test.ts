// @vitest-environment jsdom
/**
 * The avatar slot stays as the shell rendered it.
 *
 * The default shell renders `<div class="aparte-avatar">` EMPTY and the stylesheet
 * hides it while it stays empty:
 *
 *   .aparte-avatar:empty { display: none }
 *   // No message avatar by default — the slot only shows once an AvatarProvider
 *   // (or a consumer) fills it.
 *
 * `_updateName()` wrote a one-letter initial into it unconditionally, and
 * `_onConfigChange` calls `_updateName()`. So every notifying setter —
 * `setLocale`, `setBubbleActions`, `setIconProvider` — filled the slot on bubbles
 * that were already on screen: avatars appeared across the transcript on a click
 * that had nothing to do with them, and undoing the click did not remove them
 * because the text was already written. Reported from the landing page's icon-set
 * switcher, where "Default" could not undo what "Solid" had done.
 *
 * A language switcher is enough to trigger it, so this was not a demo quirk.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat-bubble.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';

type BubbleEl = HTMLElement;

// A bubble resolves its config with `resolveConfig(this)`, which walks up to a
// marked host and otherwise lands on the global — so a detached property is not a
// way in. The global it is, reset after each test.
const config = aparteGlobalConfig;

function mount(): BubbleEl {
    const el = document.createElement('aparte-chat-bubble') as BubbleEl;
    el.setAttribute('message-id', 'm1');
    el.setAttribute('data-role', 'assistant');
    el.setAttribute('name', 'Assistant');
    document.body.appendChild(el);
    return el;
}

const slot = (el: BubbleEl) => el.querySelector('.aparte-avatar') as HTMLElement | null;

describe('the avatar slot', () => {
    afterEach(() => { document.body.innerHTML = ''; aparteGlobalConfig.reset(); });

    it('is empty on the first render, so the stylesheet hides it', () => {
        const el = mount();
        expect(slot(el)).not.toBeNull();
        expect(slot(el)!.textContent).toBe('');
    });

    it('stays empty when a config change notifies rendered bubbles', () => {
        const el = mount();
        expect(slot(el)!.textContent).toBe('');

        // Each of these notifies deliberately, so already-rendered bubbles pick the
        // change up. None of them is about avatars.
        config.setIconProvider({ send: () => '<svg/>' });
        expect(slot(el)!.textContent, 'setIconProvider filled the avatar').toBe('');

        config.setBubbleActions({ retry: true });
        expect(slot(el)!.textContent, 'setBubbleActions filled the avatar').toBe('');

        config.setLocale({ ...config.getLocale(), sendButton: 'Envoyer' });
        expect(slot(el)!.textContent, 'setLocale filled the avatar').toBe('');
    });

    it('stays empty when the name or the role changes', () => {
        const el = mount();
        el.setAttribute('name', 'Someone Else');
        expect(slot(el)!.textContent).toBe('');
        el.setAttribute('data-role', 'user');
        expect(slot(el)!.textContent).toBe('');
    });

    it('is filled by an AvatarProvider, and a config change does not clobber it', () => {
        config.setAvatarProvider({
            render: (_role, host) => { host.textContent = '★'; },
        });
        const el = mount();
        expect(slot(el)!.textContent).toBe('★');

        config.setLocale({ ...config.getLocale(), sendButton: 'Envoyer' });
        expect(slot(el)!.textContent, 'a locale change overwrote the provider').toBe('★');
    });

    it('still refreshes an initial a CUSTOM shell chose to render', () => {
        // `avatarInitial` is part of the shell contract, so a shell that renders one
        // must still see it kept in sync. This is why the guard is "already
        // non-empty" and not "no provider" — the narrower rule would have frozen a
        // custom shell's initial at whatever the first name was.
        config.setBubbleShellRenderer(({ role, name, avatarInitial }) => `
            <div class="aparte-message" data-role="${role}">
              <div class="aparte-avatar" data-role="${role}">${avatarInitial}</div>
              <div class="aparte-name">${name}</div>
              <div class="aparte-content"></div>
            </div>`);
        const el = mount();
        expect(slot(el)!.textContent).toBe('A');   // "Assistant"

        el.setAttribute('name', 'Zoe');
        expect(slot(el)!.textContent, 'a custom shell initial went stale').toBe('Z');
    });
});
