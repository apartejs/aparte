// @vitest-environment jsdom
/**
 * A link the model wrote is announced before the browser follows it (issue #38).
 *
 * The event is the host's hook: cancel it and the click goes nowhere, so an Electron
 * app can open the URL in the system browser, a web app can ask first, and neither
 * has to intercept the DOM. With no listener nothing changes — the browser follows
 * the link, which the sanitizer has made open in a new tab.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat-bubble.js';
import type { AparteLinkClickEventDetail } from '../../../types/events.js';

function mount(): HTMLElement {
    const bubble = document.createElement('aparte-chat-bubble');
    bubble.setAttribute('message-id', 'm1');
    document.body.appendChild(bubble);
    return bubble;
}

function linkIn(bubble: HTMLElement, href: string): HTMLAnchorElement {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = 'docs';
    bubble.appendChild(a);
    return a;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('aparte-chat-bubble — aparte-link-click', () => {
    // In-page hrefs where the click is NOT cancelled: jsdom implements hash navigation
    // and logs "not implemented" for anything else, and the noise would read as a
    // failure. The cancelled case below uses a real URL, since nothing navigates.
    it('announces a click on a link in the body, with the href, the anchor and the message id', () => {
        const bubble = mount();
        const a = linkIn(bubble, '#page');
        const seen: AparteLinkClickEventDetail[] = [];
        bubble.addEventListener('aparte-link-click', (e) => seen.push((e as CustomEvent<AparteLinkClickEventDetail>).detail));

        a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(seen).toHaveLength(1);
        expect(seen[0]!.href).toBe('#page');
        expect(seen[0]!.anchor).toBe(a);
        expect(seen[0]!.messageId).toBe('m1');
    });

    it('bubbles, so a host listens on the chat rather than on every bubble', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const bubble = document.createElement('aparte-chat-bubble');
        host.appendChild(bubble);
        const a = linkIn(bubble, '#host');
        let heard = false;
        host.addEventListener('aparte-link-click', () => { heard = true; });

        a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(heard).toBe(true);
    });

    it('preventDefault() on the event cancels the click — the browser does not navigate', () => {
        const bubble = mount();
        const a = linkIn(bubble, 'https://example.com');
        bubble.addEventListener('aparte-link-click', (e) => e.preventDefault());

        const click = new MouseEvent('click', { bubbles: true, cancelable: true });
        a.dispatchEvent(click);

        expect(click.defaultPrevented).toBe(true);
    });

    it('leaves the click alone when nobody cancels', () => {
        const bubble = mount();
        const a = linkIn(bubble, '#alone');
        const click = new MouseEvent('click', { bubbles: true, cancelable: true });
        a.dispatchEvent(click);
        expect(click.defaultPrevented).toBe(false);
    });

    it('ignores clicks that are not on a link', () => {
        const bubble = mount();
        const span = document.createElement('span');
        span.textContent = 'plain';
        bubble.appendChild(span);
        let fired = 0;
        bubble.addEventListener('aparte-link-click', () => { fired++; });

        span.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(fired).toBe(0);
    });
});
