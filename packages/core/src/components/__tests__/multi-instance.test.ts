import { describe, it, expect, afterEach } from 'vitest';

/**
 * Multi-instance isolation — the test that never existed.
 *
 * Two chats on one page, each under its own [data-aparte-host] boundary with its
 * own AparteConfigClass: components must resolve THEIR config (icons, locale,
 * markdown, bubble actions) and never leak across instances or into the global.
 */

import '../bubble/aparte-chat-bubble.js';
import { AparteConfig, AparteConfigClass } from '../../config/aparte-config.js';
import { attachConfig, detachConfig } from '../../config/config-context.js';

type BubbleEl = HTMLElement & { setContent(content: string): void };

function host(): HTMLElement {
    const el = document.createElement('div');
    document.body.appendChild(el);
    return el;
}

function bubbleIn(parent: HTMLElement, attrs: Record<string, string> = {}): BubbleEl {
    const el = document.createElement('aparte-chat-bubble') as BubbleEl;
    el.setAttribute('role', attrs['role'] ?? 'assistant');
    el.setAttribute('message-id', attrs['message-id'] ?? 'm1');
    parent.appendChild(el);
    return el;
}

function cfgWithCopyIcon(marker: string): AparteConfigClass {
    const cfg = new AparteConfigClass();
    // Spread the full fallback provider — getIconProvider() returns the raw
    // provider (no per-key fallback), so a partial one crashes other icons.
    cfg.setIconProvider({ ...cfg.getIconProvider(), copy: () => `<svg data-marker="${marker}"></svg>` });
    return cfg;
}

describe('multi-instance config isolation', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        AparteConfig.reset();
    });

    it('two chats resolve their own icon providers; an outside bubble stays global', () => {
        const hostA = host();
        const hostB = host();
        attachConfig(hostA, cfgWithCopyIcon('chat-a'));
        attachConfig(hostB, cfgWithCopyIcon('chat-b'));

        const a = bubbleIn(hostA);
        const b = bubbleIn(hostB);
        const outside = bubbleIn(document.body as unknown as HTMLElement);

        expect(a.querySelector('.aparte-action-btn[data-action="copy"]')!.innerHTML).toContain('data-marker="chat-a"');
        expect(b.querySelector('.aparte-action-btn[data-action="copy"]')!.innerHTML).toContain('data-marker="chat-b"');
        // No boundary above it → global fallback icon (not either instance's).
        expect(outside.querySelector('.aparte-action-btn[data-action="copy"]')!.innerHTML).not.toContain('data-marker');
    });

    it('per-instance bubble actions do not leak to the other chat', () => {
        const hostA = host();
        const hostB = host();
        const cfgA = new AparteConfigClass();
        const cfgB = new AparteConfigClass();
        cfgA.setBubbleActions({ copy: false, retry: false, edit: false, feedback: false });
        attachConfig(hostA, cfgA);
        attachConfig(hostB, cfgB);

        const a = bubbleIn(hostA);
        const b = bubbleIn(hostB);

        expect(a.querySelectorAll('.aparte-action-btn')).toHaveLength(0);
        expect(b.querySelectorAll('.aparte-action-btn').length).toBeGreaterThan(0);
    });

    it('per-instance markdown providers render independently', () => {
        const hostA = host();
        const hostB = host();
        const cfgA = new AparteConfigClass();
        const cfgB = new AparteConfigClass();
        cfgA.setMarkdownProvider((raw) => `<p data-md="a">${raw}</p>`);
        cfgB.setMarkdownProvider((raw) => `<p data-md="b">${raw}</p>`);
        attachConfig(hostA, cfgA);
        attachConfig(hostB, cfgB);

        const a = bubbleIn(hostA);
        const b = bubbleIn(hostB);
        a.setContent('hello');
        b.setContent('hello');

        expect(a.querySelector('[data-md="a"]')).not.toBeNull();
        expect(a.querySelector('[data-md="b"]')).toBeNull();
        expect(b.querySelector('[data-md="b"]')).not.toBeNull();
    });

    it('a boundary attached AFTER the bubble mounts still wins (live resolution)', () => {
        const hostA = host();
        const a = bubbleIn(hostA);
        // Sanity: starts on the global (default icon, no marker).
        expect(a.querySelector('.aparte-action-btn[data-action="copy"]')!.innerHTML).not.toContain('data-marker');

        // AparteChatHost.bind() runs post-mount — attaching late must still apply.
        attachConfig(hostA, cfgWithCopyIcon('late'));
        // The bubble listens for config-change to rebuild; simulate the notify
        // path by dispatching the same window event the config emits.
        window.dispatchEvent(new CustomEvent('aparte-config-change'));

        expect(a.querySelector('.aparte-action-btn[data-action="copy"]')!.innerHTML).toContain('data-marker="late"');
    });

    it('detachConfig returns the subtree to the global config', () => {
        const hostA = host();
        attachConfig(hostA, cfgWithCopyIcon('temp'));
        const a = bubbleIn(hostA);
        expect(a.querySelector('.aparte-action-btn[data-action="copy"]')!.innerHTML).toContain('data-marker="temp"');

        detachConfig(hostA);
        window.dispatchEvent(new CustomEvent('aparte-config-change'));
        expect(a.querySelector('.aparte-action-btn[data-action="copy"]')!.innerHTML).not.toContain('data-marker');
    });

    it('changing the global config does not override instance configs', () => {
        const hostA = host();
        attachConfig(hostA, cfgWithCopyIcon('instance'));
        const a = bubbleIn(hostA);

        const full = AparteConfig.getIconProvider();
        AparteConfig.setIconProvider({ ...full, copy: () => '<svg data-marker="global"></svg>' } as any);

        // The global notify rebuilds all action bars — but this bubble re-reads
        // ITS instance config, not the global.
        expect(a.querySelector('.aparte-action-btn[data-action="copy"]')!.innerHTML).toContain('data-marker="instance"');
    });
});
