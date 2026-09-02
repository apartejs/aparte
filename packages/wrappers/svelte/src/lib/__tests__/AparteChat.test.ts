import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
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

    it('exposes getViewport() (cross-wrapper accessor)', () => {
        const { component, container } = render(AparteChat, { messages: [] });
        const viewport = (component as unknown as { getViewport(): HTMLElement | null }).getViewport();
        expect(viewport).not.toBeNull();
        expect(viewport).toBe(container.querySelector('aparte-chat-viewport'));
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

    it('overlayComposer puts overlay-composer on the shell; off by default', () => {
        const on = render(AparteChat, { messages: [], overlayComposer: true });
        expect((on.container.querySelector('.aparte-chat-container') as HTMLElement).hasAttribute('overlay-composer')).toBe(true);
        const off = render(AparteChat, { messages: [] });
        expect((off.container.querySelector('.aparte-chat-container') as HTMLElement).hasAttribute('overlay-composer')).toBe(false);
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

    // Callback props alongside the events (#47). `createEventDispatcher` and the `on:`
    // directive on a component are the Svelte 4 path; Svelte 5 documents both as
    // deprecated and recommends callback props. The wrapper keeps the events, so a
    // Svelte 4 consumer changes nothing, and calls the matching callback prop with the
    // same payload — the payload itself, not a CustomEvent to unwrap — so a Svelte 5
    // consumer never writes `on:` on the component. Measured before this landed: the
    // 5.56 compiler warns on neither form, so this is the idiom, not an emergency.
    it('calls the onmessageSent callback prop with the payload, alongside the event', async () => {
        const onmessageSent = vi.fn();
        const { container, component } = render(AparteChat, { messages: [], onmessageSent });
        const viaEvent = vi.fn();
        (component as any).$on('messageSent', (e: any) => viaEvent(e.detail));

        const detail = { content: 'Both routes', timestamp: Date.now() };
        container.querySelector('aparte-composer')?.dispatchEvent(new CustomEvent('aparte-send', { detail, bubbles: true, composed: true }));

        expect(onmessageSent).toHaveBeenCalledWith(detail);
        expect(viaEvent, 'the event still fires for a Svelte 4 consumer').toHaveBeenCalledWith(detail);
    });

    it('calls the onaction callback prop when a custom bubble action fires', async () => {
        const onaction = vi.fn();
        const { container } = render(AparteChat, { messages: [], onaction });
        await tick();

        const detail = { actionId: 'custom:bookmark', messageId: 'm1' };
        // A bubble's action BUBBLES to the root, where the listener is attached on mount:
        // dispatched from a descendant (the composer, always present), like `aparte-send` above.
        container.querySelector('aparte-composer')!.dispatchEvent(new CustomEvent('aparte-action', { detail, bubbles: true, composed: true }));

        expect(onaction).toHaveBeenCalledWith(detail);
    });

    it('renders custom composer slot content in place of the default shell', () => {
        const { container } = render(CustomComposerHost, { messages: [] });

        const composer = container.querySelector('aparte-composer');
        expect(composer?.querySelector('.my-custom-composer')).not.toBeNull();
        expect(composer?.querySelector('.aparte-composer-shell')).toBeNull();
    });

    // Parity across the four wrappers: an empty assistant message with NO status is
    // a reply on its way (core's `isAwaitingReply`), so the bubble renders in-flight.
    it('marks an empty assistant message (no status) as awaiting a reply', () => {
        const { container } = render(AparteChat, {
            messages: [{ id: 'a1', role: 'assistant', content: '', timestamp: 0 }],
        });
        const bubble = container.querySelector('aparte-chat-bubble[message-id="a1"]')!;
        expect(bubble.getAttribute('streaming')).toBe('');
    });

    // Attachments are opt-in across core and all four wrappers: the picker is only
    // honest when the host consumes `detail.files` (an AparteClient does; a
    // hand-rolled loop must). Same three assertions in every wrapper's suite so a
    // divergence in one of them fails the gate.
    it('mounts no attachment primitives by default', () => {
        const { container } = render(AparteChat, { messages: [] });
        expect(container.querySelector('aparte-composer-add-attachment')).toBeNull();
        expect(container.querySelector('aparte-composer-attachments')).toBeNull();
    });

    // Parity with core's <aparte-chat>, whose default composition ships the presenter.
    it('renders the elicitation presenter inside the host by default, before the composer', () => {
        const { container } = render(AparteChat, { messages: [] });
        const host = container.querySelector('[data-aparte-chat]')!;
        const presenter = host.querySelector(':scope > aparte-elicitation');
        expect(presenter).not.toBeNull();
        expect(presenter!.nextElementSibling!.tagName.toLowerCase()).toBe('aparte-composer');
    });

    it('omits the presenter with elicitation={false}', () => {
        const { container } = render(AparteChat, { messages: [], elicitation: false });
        expect(container.querySelector('aparte-elicitation')).toBeNull();
    });

    it('merges class and style onto the root element', () => {
        const { container } = render(AparteChat, { messages: [], class: 'flex-1 min-h-0', style: 'min-height: 0px' });
        const host = container.querySelector('[data-aparte-chat]') as HTMLElement;
        expect(host.classList.contains('aparte-chat-container')).toBe(true);
        expect(host.classList.contains('flex-1')).toBe(true);
        expect(host.classList.contains('min-h-0')).toBe(true);
        expect(host.style.minHeight).toBe('0px');
    });

    it('mounts the picker and the chips strip with attachments', () => {
        const { container } = render(AparteChat, { messages: [], attachments: true });
        expect(container.querySelector('.aparte-composer-shell > aparte-composer-attachments')).not.toBeNull();
        const row = container.querySelector('.aparte-composer-row')!;
        expect(row.firstElementChild!.tagName.toLowerCase()).toBe('aparte-composer-add-attachment');
    });

    it('leaves a custom composer alone even with attachments', () => {
        const { container } = render(CustomComposerHost, { messages: [], attachments: true });
        expect(container.querySelector('.my-custom-composer')).not.toBeNull();
        expect(container.querySelector('aparte-composer-add-attachment')).toBeNull();
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

    it('projects above-composer and the toolbar into the default shell', () => {
        const { container } = render(SlotHost, { messages: [] });

        const banner = container.querySelector('.above-banner')!;
        const composer = container.querySelector('aparte-composer')!;
        expect(banner).not.toBeNull();
        // above-composer renders before the composer element.
        expect(banner.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

        // Projected with `svelte:fragment`, so the two nodes are DIRECT children of the
        // row -- same shape as React and Vue, and the DOM order IS the placement.
        const toolbar = composer.querySelector('aparte-composer-toolbar')!;
        expect(toolbar).not.toBeNull();
        expect([...toolbar.children].map((c) => c.className)).toEqual(['mode', 'model']);
    });

    it('projects empty-state while there are no messages, and drops it on the first', async () => {
        // Every example fills this slot and NOTHING proved it — not one unit test in
        // any of the four wrappers, and no browser assertion either. Its contract is two
        // halves ("Replaced by the message list on the first message") and the second is
        // the one that silently rots: a welcome block still showing under a live
        // conversation is the visible bug.
        const { container, component } = render(SlotHost, { messages: [] });
        expect(container.querySelector('.welcome-block')).not.toBeNull();

        await (component as unknown as { $set: (p: Record<string, unknown>) => void })
            .$set({ messages: [{ id: '1', role: 'user', content: 'hi', timestamp: 0 }] });
        await tick();
        expect(container.querySelector('.welcome-block')).toBeNull();
    });

    it('renders no toolbar element at all when the slot is unused', () => {
        const { container } = render(AparteChat, { messages: [] });
        const composer = container.querySelector('aparte-composer');
        expect(composer?.querySelector('aparte-composer-toolbar')).toBeNull();
    });

    it('exposes scrollToBottom function', () => {
        const { component } = render(AparteChat, {
            messages: []
        });

        expect((component as any).scrollToBottom).toBeDefined();
        (component as any).scrollToBottom();
    });

    // NB: @testing-library/svelte's `render` here does NOT run `onMount` — the
    // SSR-safe test below depends on that. Everything this wrapper builds in
    // `onMount` is therefore out of reach of this harness:
    //   - the AparteChatHost binding (so `config`/`attachConfig`, the typed `action`
    //     and `typingChange` events — all host-driven — cannot be asserted here),
    //   - <AparteUi>, which creates its element in `onMount` too.
    // REVISITED with the callback props (#47): the harness ran on Svelte's SERVER build
    // (no `resolve.conditions: ['browser']` in vitest.config.ts), where `onMount` is a
    // no-op — so the host was never constructed and the listeners never attached, and
    // every test above passed without them. The condition is set now; `onMount` runs,
    // `AparteUi.test.ts` exists, and the test below asserts the mount instead of its
    // absence.

    it('generates the host id in onMount, never at render time (SSR-safe, #9)', () => {
        // The id is generated client-side, in onMount, so a server render carries none and
        // the first client render agrees with it (no hydration mismatch — it used to be
        // crypto.randomUUID at instance scope). Two halves: mounted here, the id exists;
        // and the generation sits inside `onMount` in the source, which is the SSR proof
        // this browser-build harness cannot make by rendering.
        const { container } = render(AparteChat, { messages: [] });
        const host = container.querySelector('.aparte-chat-container') as HTMLElement | null;
        expect(host).not.toBeNull();
        expect(host!.id).toMatch(/^aparte-chat-/);

        // Not `import.meta.url`: under Vite it is not a file URL. The cwd is the package
        // under `pnpm -C`, the repo root under the root `pnpm test` — try both.
        const candidates = ['src/lib/AparteChat.svelte', 'packages/wrappers/svelte/src/lib/AparteChat.svelte'];
        const path = candidates.find((p) => existsSync(p));
        expect(path, 'the component source is readable from either working directory').toBeTruthy();
        const source = readFileSync(path!, 'utf8');
        const mount = source.indexOf('onMount(() => {');
        const generation = source.indexOf('hostId = id ?? `aparte-chat-${uuid()}`');
        expect(mount, 'onMount is where the id is made').toBeGreaterThan(-1);
        expect(generation, 'the generation line exists').toBeGreaterThan(mount);
    });
});
