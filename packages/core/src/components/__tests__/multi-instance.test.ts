import { describe, it, expect, afterEach } from 'vitest';

/**
 * Multi-instance isolation — the test that never existed.
 *
 * Two chats on one page, each under its own [data-aparte-host] boundary with its
 * own AparteConfig: components must resolve THEIR config (icons, locale,
 * markdown, bubble actions) and never leak across instances or into the global.
 */

import '../bubble/aparte-chat-bubble.js';
import '../composer/aparte-composer.js';
import '../status/aparte-chat-status.js';
import { aparteGlobalConfig, AparteConfig } from '../../config/aparte-config.js';
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

function cfgWithCopyIcon(marker: string): AparteConfig {
    const cfg = new AparteConfig();
    // A one-icon provider is enough: getIconProvider() completes it from the
    // built-in fallbacks (it used to hand back the raw provider, so every other
    // icon crashed and callers had to spread a full set in first).
    cfg.setIconProvider({ copy: () => `<svg data-marker="${marker}"></svg>` });
    return cfg;
}

describe('multi-instance config isolation', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        aparteGlobalConfig.reset();
    });

    it('two chats resolve their own icon providers; an outside bubble stays global', () => {
        const hostA = host();
        const hostB = host();
        attachConfig(hostA, cfgWithCopyIcon('chat-a'));
        attachConfig(hostB, cfgWithCopyIcon('chat-b'));

        const a = bubbleIn(hostA);
        const b = bubbleIn(hostB);
        const outside = bubbleIn(document.body as unknown as HTMLElement);

        expect(a.querySelector('.aparte-chat-bubble__action[data-action="copy"]')!.innerHTML).toContain('data-marker="chat-a"');
        expect(b.querySelector('.aparte-chat-bubble__action[data-action="copy"]')!.innerHTML).toContain('data-marker="chat-b"');
        // No boundary above it → global fallback icon (not either instance's).
        expect(outside.querySelector('.aparte-chat-bubble__action[data-action="copy"]')!.innerHTML).not.toContain('data-marker');
    });

    it('per-instance bubble actions do not leak to the other chat', () => {
        const hostA = host();
        const hostB = host();
        const cfgA = new AparteConfig();
        const cfgB = new AparteConfig();
        cfgA.setBubbleActions({ copy: false, retry: false, edit: false, feedback: false });
        attachConfig(hostA, cfgA);
        attachConfig(hostB, cfgB);

        const a = bubbleIn(hostA);
        const b = bubbleIn(hostB);

        expect(a.querySelectorAll('.aparte-chat-bubble__action')).toHaveLength(0);
        expect(b.querySelectorAll('.aparte-chat-bubble__action').length).toBeGreaterThan(0);
    });

    it('per-instance markdown providers render independently', () => {
        const hostA = host();
        const hostB = host();
        const cfgA = new AparteConfig();
        const cfgB = new AparteConfig();
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
        expect(a.querySelector('.aparte-chat-bubble__action[data-action="copy"]')!.innerHTML).not.toContain('data-marker');

        // AparteChatHost.bind() runs post-mount — attaching late must still apply.
        attachConfig(hostA, cfgWithCopyIcon('late'));
        // The bubble listens for config-change to rebuild; simulate the notify
        // path by dispatching the same window event the config emits.
        window.dispatchEvent(new CustomEvent('aparte-config-change'));

        expect(a.querySelector('.aparte-chat-bubble__action[data-action="copy"]')!.innerHTML).toContain('data-marker="late"');
    });

    it('detachConfig returns the subtree to the global config', () => {
        const hostA = host();
        attachConfig(hostA, cfgWithCopyIcon('temp'));
        const a = bubbleIn(hostA);
        expect(a.querySelector('.aparte-chat-bubble__action[data-action="copy"]')!.innerHTML).toContain('data-marker="temp"');

        detachConfig(hostA);
        window.dispatchEvent(new CustomEvent('aparte-config-change'));
        expect(a.querySelector('.aparte-chat-bubble__action[data-action="copy"]')!.innerHTML).not.toContain('data-marker');
    });

    it('changing the global config does not override instance configs', () => {
        const hostA = host();
        attachConfig(hostA, cfgWithCopyIcon('instance'));
        const a = bubbleIn(hostA);

        aparteGlobalConfig.setIconProvider({ copy: () => '<svg data-marker="global"></svg>' });

        // The global notify rebuilds all action bars — but this bubble re-reads
        // ITS instance config, not the global.
        expect(a.querySelector('.aparte-chat-bubble__action[data-action="copy"]')!.innerHTML).toContain('data-marker="instance"');
    });
});

describe('the boundary attached AFTER a child mounts — every element, not just the bubble', () => {
    afterEach(() => { document.body.innerHTML = ''; aparteGlobalConfig.reset(); });

    /**
     * This is the ordering every wrapper produces and nothing tested.
     *
     * `AparteChatHost.bind()` is what calls `attachConfig`, and all four wrappers
     * call it from their POST-mount hook — React `useEffect`, Vue `onMounted`,
     * Svelte `onMount`, Angular `ngAfterViewInit`. The children they render in the
     * same commit therefore run `connectedCallback` BEFORE the boundary exists.
     *
     * `aparte-chat-bubble` resolved live and was fine. The composer and the status
     * element cached at connect and latched the GLOBAL config for good, so the
     * `config` prop those wrappers advertise did nothing for them. Worse for the
     * status element: it filters change events on the cached object, so it also went
     * permanently deaf to its own instance.
     */
    const mountThenAttach = (tag: string): { el: HTMLElement; cfg: AparteConfig } => {
        const h = host();
        const el = document.createElement(tag);
        h.appendChild(el);                 // connectedCallback runs HERE…
        const cfg = new AparteConfig();
        attachConfig(h, cfg);              // …and the boundary appears only now.
        return { el, cfg };
    };

    for (const tag of ['aparte-composer', 'aparte-chat-status', 'aparte-chat-bubble']) {
        it(`<${tag}> resolves the instance config, not the global`, () => {
            const { el, cfg } = mountThenAttach(tag);
            const resolved = (el as unknown as { _cfg: AparteConfig })._cfg;
            expect(resolved, `${tag} latched a config at connect`).toBe(cfg);
            expect(resolved).not.toBe(aparteGlobalConfig);
        });
    }

    it('the status element still hears its own config change', () => {
        const { el, cfg } = mountThenAttach('aparte-chat-status');
        // The filter compares against the live `_cfg`; with a cached one this
        // change would be discarded as "not mine".
        const seen = (el as unknown as { _cfg: AparteConfig })._cfg;
        expect(seen).toBe(cfg);
    });
});
