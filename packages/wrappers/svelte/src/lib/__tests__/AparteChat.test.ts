import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import AparteChat from '../AparteChat.svelte';
import CustomComposerHost from './CustomComposerHost.svelte';
import SlotHost from './SlotHost.svelte';
import BubbleHost from './BubbleHost.svelte';
import { registerAllComponents } from '@aparte/core';
import type { AparteMessage } from '@aparte/core';

// Ensure components are registered
registerAllComponents();

// Mock scrollToBottom and other browser APIs
if (typeof window !== 'undefined') {
    if (typeof HTMLElement !== 'undefined' && !Object.prototype.hasOwnProperty.call(HTMLElement.prototype, 'scrollToBottom')) {
        (HTMLElement.prototype as unknown as Record<string, unknown>).scrollToBottom = vi.fn();
    }

    // Stub requestAnimationFrame to avoid async leaks
    window.requestAnimationFrame = (callback) => setTimeout(callback, 0) as unknown as number;
    window.cancelAnimationFrame = (id) => clearTimeout(id);

    // Stub ResizeObserver if not present
    if (!window.ResizeObserver) {
        (window as any).ResizeObserver = class {
            observe() { /* noop */ }
            unobserve() { /* noop */ }
            disconnect() { /* noop */ }
        };
    }
}

describe('AparteChat.svelte', () => {
    const mockMessages: AparteMessage[] = [
        { id: '1', role: 'user', content: 'Hello', timestamp: Date.now() },
        { id: '2', role: 'assistant', content: 'Hi there!', timestamp: Date.now() + 1000 }
    ];

    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it('renders correct number of messages', () => {
        const { container } = render(AparteChat, {
            messages: mockMessages
        });

        const bubbles = container.querySelectorAll('aparte-chat-bubble');
        expect(bubbles.length).toBe(2);
        expect(bubbles[0].getAttribute('message-id')).toBe('1');
        expect(bubbles[1].getAttribute('message-id')).toBe('2');
    });

    it('adds --auto-center + data-aparte-empty only while centerWhenEmpty and empty', async () => {
        const { container, component } = render(AparteChat, { messages: [], centerWhenEmpty: true });
        const box = container.querySelector('.aparte-chat-container') as HTMLElement;
        expect(box.classList.contains('aparte-chat-container--auto-center')).toBe(true);
        expect(box.getAttribute('data-aparte-empty')).toBe('');
        (component as any).$set({ messages: mockMessages });
        await tick();
        expect(box.getAttribute('data-aparte-empty')).toBeNull();
    });

    it('never opts in when centerWhenEmpty is off (default)', () => {
        const { container } = render(AparteChat, { messages: [] });
        const box = container.querySelector('.aparte-chat-container') as HTMLElement;
        expect(box.classList.contains('aparte-chat-container--auto-center')).toBe(false);
        expect(box.getAttribute('data-aparte-empty')).toBeNull();
    });

    it('shows typing status when isTyping is true', async () => {
        const { container, component } = render(AparteChat, {
            messages: [],
            isTyping: false
        });

        const status = container.querySelector('aparte-chat-status');
        expect(status?.getAttribute('visible')).toBeNull();

        // Update prop
        // Svelte 4 component.$set
        (component as any).$set({ isTyping: true });

        await tick();

        expect(status?.getAttribute('visible')).toBe('');
    });

    it('dispatches messageSent when the composer fires aparte-send', async () => {
        const { container, component } = render(AparteChat, {
            messages: []
        });

        const composer = container.querySelector('aparte-composer');
        const detail = { content: 'New message', timestamp: Date.now() };

        const onMessageSent = vi.fn();
        (component as any).$on('messageSent', (e: any) => onMessageSent(e.detail));

        composer?.dispatchEvent(new CustomEvent('aparte-send', { detail, bubbles: true, composed: true }));

        expect(onMessageSent).toHaveBeenCalledWith(detail);
    });

    it('renders custom composer slot content in place of the default shell', () => {
        const { container } = render(CustomComposerHost, { messages: [] });

        const composer = container.querySelector('aparte-composer');
        expect(composer?.querySelector('.my-custom-composer')).not.toBeNull();
        expect(composer?.querySelector('.aparte-composer-shell')).toBeNull();
    });

    it('renders a custom bubble via the `bubble` slot in place of the native one', () => {
        const { container } = render(BubbleHost, { messages: [
            { id: '1', role: 'user', content: 'Hi', timestamp: 0 },
            { id: '2', role: 'assistant', content: 'Yo', timestamp: 1 },
        ] });
        expect(container.querySelectorAll('aparte-chat-bubble').length).toBe(0);
        const custom = container.querySelectorAll('.my-bubble');
        expect(custom.length).toBe(2);
        expect(custom[0].getAttribute('data-id')).toBe('1');
        expect(custom[0].textContent).toBe('Hi');
    });

    it('re-renders the custom bubble when message content changes (streaming channel)', async () => {
        const { container, component } = render(BubbleHost, { messages: [{ id: '1', role: 'assistant', content: 'Hel', timestamp: 0 }] });
        expect(container.querySelector('.my-bubble')?.textContent).toBe('Hel');
        await (component as unknown as { $set: (p: Record<string, unknown>) => void }).$set({ messages: [{ id: '1', role: 'assistant', content: 'Hello world', timestamp: 0 }] });
        await tick();
        expect(container.querySelector('.my-bubble')?.textContent).toBe('Hello world');
    });

    it('projects above-composer and footer slots into the default shell', () => {
        const { container } = render(SlotHost, { messages: [] });

        const banner = container.querySelector('.above-banner')!;
        const composer = container.querySelector('aparte-composer')!;
        expect(banner).not.toBeNull();
        // above-composer renders before the composer element.
        expect(banner.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

        const footer = composer.querySelector('.aparte-composer-footer')!;
        expect(footer).not.toBeNull();
        expect(footer.querySelector('.fl')?.textContent).toBe('L');
        expect(footer.querySelector('.fc')?.textContent).toBe('C');
        expect(footer.querySelector('.fr')?.textContent).toBe('R');
    });

    it('omits the footer row entirely when no footer slot is provided', () => {
        const { container } = render(AparteChat, { messages: [] });
        const composer = container.querySelector('aparte-composer');
        expect(composer?.querySelector('.aparte-composer-footer')).toBeNull();
    });

    it('exposes scrollToBottom function', () => {
        const { component } = render(AparteChat, {
            messages: []
        });

        expect((component as any).scrollToBottom).toBeDefined();
        (component as any).scrollToBottom();
    });

    // NB: config forwarding is exercised end-to-end in the React and Vue wrapper
    // suites (identical wiring). @testing-library/svelte's `render` here does not
    // run `onMount`, so the host (and its `attachConfig`) never executes — see the
    // SSR-safe test below — making a runtime resolveConfig() assertion impossible.
    // The `config` prop's type is still validated by the Svelte build.
    //
    // The typed `action` and `typingChange` events are wired the same way (their
    // dispatch runs from `onMount` / the host callbacks, which this harness skips);
    // the identical forwarding is verified in the React and Vue suites, and the
    // dispatch types are validated by the Svelte build.

    it('does not generate the host id at render time — deferred to onMount (SSR-safe, #9)', () => {
        // This render is the SSR-equivalent (onMount does not run). The host id must be
        // empty here so server and first client render agree — the id is generated
        // client-side in onMount, avoiding a hydration mismatch (was crypto.randomUUID
        // at instance scope).
        const { container } = render(AparteChat, { messages: [] });
        const host = container.querySelector('.aparte-chat-container') as HTMLElement | null;
        expect(host).not.toBeNull();
        expect(host!.id).toBe('');
    });
});
