// @vitest-environment jsdom
/**
 * A link the model wrote opens where the chat's config says (#205): in a new tab by default,
 * same-site ones included, and drawn again in place when the app keeps same-site links in the
 * page. Its click is still announced first, and a cancelled announcement keeps the page where
 * it is. The Markdown provider is a stand-in — core cannot import a plugin — that writes
 * `[text](href)` as a bare anchor, as marked does.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat-bubble.js';
import { aparteGlobalConfig } from '../../../config/index.js';
import type { AparteLinkClickEventDetail } from '../../../types/events.js';

interface BubbleEl extends HTMLElement {
    setSegments(segments: unknown[]): void;
}

const links = (md: string): string => md.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

function mount(content: string): BubbleEl {
    aparteGlobalConfig.setMarkdownProvider(links);
    const el = document.createElement('aparte-chat-bubble') as BubbleEl;
    el.setAttribute('message-id', 'm1');
    el.setAttribute('data-role', 'assistant');
    document.body.appendChild(el);
    el.setSegments([{ id: 's1', type: 'text', content }]);
    return el;
}

const anchor = (el: HTMLElement, href: string): HTMLAnchorElement =>
    el.querySelector<HTMLAnchorElement>(`.aparte-segments a[href="${href}"]`)!;

describe('a link in a reply', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        aparteGlobalConfig.reset();
    });

    it('opens in a new tab, same-site or not; a link to the page itself stays', () => {
        const el = mount('Open [package.json](package.json), [the guide](https://example.com/guide) or [the steps](#steps).');
        for (const href of ['package.json', 'https://example.com/guide']) {
            expect(anchor(el, href).getAttribute('target'), href).toBe('_blank');
            expect(anchor(el, href).getAttribute('rel'), href).toBe('noopener noreferrer');
        }
        expect(anchor(el, '#steps').hasAttribute('target')).toBe(false);
    });

    it('is drawn again in the page once the app keeps same-site links there', async () => {
        const el = mount('Open [package.json](package.json) or [the guide](https://example.com/guide).');
        expect(anchor(el, 'package.json').getAttribute('target')).toBe('_blank');

        aparteGlobalConfig.setLinkTarget('external-only');
        await Promise.resolve();
        expect(anchor(el, 'package.json').hasAttribute('target')).toBe(false);
        expect(anchor(el, 'package.json').hasAttribute('rel')).toBe(false);
        expect(anchor(el, 'https://example.com/guide').getAttribute('target')).toBe('_blank');
    });

    it('is announced before it is followed, and a cancelled announcement keeps the page where it is', () => {
        const el = mount('Open [package.json](package.json).');
        const seen: AparteLinkClickEventDetail[] = [];
        el.addEventListener('aparte-link-click', (event) => {
            seen.push((event as CustomEvent<AparteLinkClickEventDetail>).detail);
            event.preventDefault();
        });
        const a = anchor(el, 'package.json');
        const click = new MouseEvent('click', { bubbles: true, cancelable: true });
        a.dispatchEvent(click);
        expect(seen).toHaveLength(1);
        expect(seen[0]!.href).toBe('package.json');
        expect(seen[0]!.anchor).toBe(a);
        expect(seen[0]!.messageId).toBe('m1');
        expect(click.defaultPrevented).toBe(true);
    });
});
