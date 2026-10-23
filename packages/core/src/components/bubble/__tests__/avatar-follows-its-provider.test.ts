// @vitest-environment jsdom
/**
 * The avatar slot follows the provider, and shows a picture the stylesheet names.
 *
 * `setAvatarProvider(null)` returned early, before touching the slot, so the avatars a provider
 * had drawn stayed on every message already on screen. And a slot left empty is hidden, so
 * `--aparte-avatar-image-*` — documented as a logo with no provider — painted nothing: the bubble
 * now marks an empty slot whose role names an image (`data-image`), which the hiding rule skips.
 *
 * jsdom does not cascade custom properties, so the computed token is stubbed here; the painted
 * half is in e2e/tests/theming.spec.ts.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '../aparte-chat-bubble.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';

function mount(role = 'assistant'): HTMLElement {
    const el = document.createElement('aparte-chat-bubble');
    el.setAttribute('message-id', 'm1');
    el.setAttribute('data-role', role);
    document.body.appendChild(el);
    return el;
}

const slot = (el: HTMLElement) => el.querySelector('.aparte-avatar') as HTMLElement;

/** The stylesheet's `--aparte-avatar-image-*` as the bubble reads it, for one role. */
function stubImage(role: string, value: string): void {
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => {
        const style = real(el, pseudo);
        const read = style.getPropertyValue.bind(style);
        return new Proxy(style, {
            get(target, key) {
                if (key === 'getPropertyValue') {
                    return (name: string) => (name === `--aparte-avatar-image-${role}` ? value : read(name));
                }
                return Reflect.get(target, key);
            },
        });
    });
}

afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    aparteGlobalConfig.reset();
});

describe('the avatar slot', () => {
    it('loses what the provider drew when the provider is cleared', () => {
        aparteGlobalConfig.setAvatarProvider({ render: (_role, host) => { host.textContent = 'AI'; } });
        const el = mount();
        expect(slot(el).textContent).toBe('AI');

        aparteGlobalConfig.setAvatarProvider(null);
        expect(slot(el).textContent, 'the provider is gone, so is its avatar').toBe('');
    });

    it("keeps a custom shell's own avatar when there is no provider", () => {
        aparteGlobalConfig.setBubbleShellRenderer(() =>
            '<div class="aparte-message"><div class="aparte-avatar"><img alt="" src="z.png"></div><div class="aparte-message-content"><div class="aparte-segments"></div><div class="aparte-content"></div></div><div class="aparte-action-bar"></div></div>');
        const el = mount();
        aparteGlobalConfig.setAvatarProvider(null);
        expect(slot(el).querySelector('img'), 'the shell drew it, not a provider').not.toBeNull();
    });

    // The mark lands in a microtask, before the frame: see the batching test below.
    it('is marked to show when its role names a picture, with no provider', async () => {
        stubImage('assistant', 'url("logo.svg")');
        const el = mount('assistant');
        await Promise.resolve();
        expect(slot(el).hasAttribute('data-image')).toBe(true);
    });

    it('is not marked when its role names none, the default', async () => {
        stubImage('user', 'none');
        const el = mount('user');
        await Promise.resolve();
        expect(slot(el).hasAttribute('data-image'), "the user's token is none").toBe(false);
    });

    it('is marked when a provider leaves its slot empty and the stylesheet names a picture', async () => {
        stubImage('assistant', 'url("logo.svg")');
        aparteGlobalConfig.setAvatarProvider({ render: (role, host) => { if (role === 'user') host.textContent = 'Me'; } });
        const el = mount('assistant');
        await Promise.resolve();
        expect(slot(el).hasAttribute('data-image')).toBe(true);
    });

    /*
     * Every bubble re-reads its token on a config change. Read, write, read, write: each mark
     * dirtied the style the next read had to recompute, and on a 200-message transcript a
     * language switch cost ~125ms in Chromium, ~115 of them here. Every read now comes first.
     */
    it('reads every slot before it marks any, on a config change', async () => {
        stubImage('assistant', 'url("logo.svg")');
        const bubbles = [mount('assistant'), mount('assistant'), mount('assistant')];
        await Promise.resolve();
        const log: string[] = [];
        const readOn = new Set<string>();
        const computed = window.getComputedStyle;
        vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => {
            log.push('read');
            readOn.add(el.tagName.toLowerCase());
            return computed(el, pseudo);
        });
        const toggle = Element.prototype.toggleAttribute;
        vi.spyOn(Element.prototype, 'toggleAttribute').mockImplementation(function (this: Element, name: string, force?: boolean) {
            if (name === 'data-image') log.push('write');
            return toggle.call(this, name, force);
        });

        aparteGlobalConfig.setLocale({ ...aparteGlobalConfig.getLocale(), typing: 'Typing…' });
        await Promise.resolve();
        await Promise.resolve();

        expect(log.filter((e) => e === 'read').length, 'one read per bubble').toBeGreaterThanOrEqual(bubbles.length);
        expect(log.indexOf('write'), `no mark before the last read: ${log.join(' ')}`).toBeGreaterThan(log.lastIndexOf('read'));
        // On the bubble, which an off-screen message still styles — not inside it, which it skips.
        expect([...readOn]).toEqual(['aparte-chat-bubble']);
    });

    it("runs the provider's cleanup on what it drew, not on an initial written over it", () => {
        let seen: string | null = null;
        aparteGlobalConfig.setAvatarProvider({
            render: (_role, host) => {
                host.innerHTML = '<span class="mounted">AI</span>';
                return () => { seen = host.querySelector('.mounted')?.textContent ?? 'gone'; };
            },
        });
        mount();
        aparteGlobalConfig.setAvatarProvider(null);
        expect(seen, 'the mount was still there when its cleanup ran').toBe('AI');
    });

    it('drops the mark when a provider fills the slot', () => {
        stubImage('assistant', 'url("logo.svg")');
        const el = mount('assistant');
        aparteGlobalConfig.setAvatarProvider({ render: (_role, host) => { host.textContent = 'AI'; } });
        expect(slot(el).hasAttribute('data-image')).toBe(false);
    });
});
