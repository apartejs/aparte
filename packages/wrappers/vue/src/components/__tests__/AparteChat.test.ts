import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import AparteChat from '../AparteChat.vue';
import { registerAllComponents, resolveConfig, AparteConfig, AparteConfigClass } from '@aparte/core';
import type { AparteMessage } from '@aparte/core';

// Ensure all backend components are registered
registerAllComponents();

// Mock scrollToBottom on HTMLElement since it's a custom element method
if (typeof window !== 'undefined' && typeof HTMLElement !== 'undefined' && !Object.prototype.hasOwnProperty.call(HTMLElement.prototype, 'scrollToBottom')) {
    Object.defineProperty(HTMLElement.prototype, 'scrollToBottom', {
        value: vi.fn(),
        writable: true,
        configurable: true
    });
}

describe('AparteChat.vue', () => {
    const mockMessages: AparteMessage[] = [
        { id: '1', role: 'user', content: 'Hello', timestamp: Date.now() },
        { id: '2', role: 'assistant', content: 'Hi there!', timestamp: Date.now() + 1000 }
    ];

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders correctly with messages', async () => {
        const wrapper = mount(AparteChat, {
            props: {
                messages: mockMessages
            }
        });

        // Wait for Vue and Custom Elements to settle
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(wrapper.find('aparte-chat-viewport').exists()).toBe(true);
        expect(wrapper.find('aparte-chat-status').exists()).toBe(true);

        // Find bubbles using vanilla querySelector as backup
        const bubbles = wrapper.element.querySelectorAll('aparte-chat-bubble');
        expect(bubbles.length).toBe(2);
        expect(bubbles[0].getAttribute('message-id')).toBe('1');
        expect(bubbles[1].getAttribute('message-id')).toBe('2');
    });

    it('adds --auto-center + data-aparte-empty only while centerWhenEmpty and empty', async () => {
        const wrapper = mount(AparteChat, { props: { messages: [], centerWhenEmpty: true } });
        const box = wrapper.element as HTMLElement;
        expect(box.classList.contains('aparte-chat-container--auto-center')).toBe(true);
        expect(box.getAttribute('data-aparte-empty')).toBe('');
        await wrapper.setProps({ messages: mockMessages });
        expect(box.getAttribute('data-aparte-empty')).toBeNull();
    });

    it('never opts in when centerWhenEmpty is off (default)', () => {
        const wrapper = mount(AparteChat, { props: { messages: [] } });
        const box = wrapper.element as HTMLElement;
        expect(box.classList.contains('aparte-chat-container--auto-center')).toBe(false);
        expect(box.getAttribute('data-aparte-empty')).toBeNull();
    });

    it('updates when isTyping prop changes', async () => {
        const wrapper = mount(AparteChat, {
            props: {
                messages: [],
                isTyping: false
            }
        });

        const status = wrapper.find('aparte-chat-status');
        expect(status.attributes('visible')).toBeFalsy();

        await wrapper.setProps({ isTyping: true });
        expect(status.attributes('visible')).toBe('');
    });

    it('emits typingChange when the host toggles the typing indicator (parity with React onTypingChange)', async () => {
        const wrapper = mount(AparteChat, {
            props: { messages: [{ id: '1', role: 'assistant', content: '', timestamp: 0 }], isTyping: true },
        });
        await new Promise(resolve => setTimeout(resolve, 0));
        // updateLastMessage(..., { append: true }) makes the host flip typing off.
        wrapper.vm.updateLastMessage('token', { append: true });
        expect(wrapper.emitted('typingChange')).toBeTruthy();
        expect(wrapper.emitted('typingChange')!.at(-1)![0]).toBe(false);
    });

    it('emits messageSent when the composer dispatches aparte-send', async () => {
        const wrapper = mount(AparteChat, {
            props: {
                messages: []
            }
        });

        const composer = wrapper.element.querySelector('aparte-composer')!;
        const detail = { content: 'New message', timestamp: Date.now() };

        composer.dispatchEvent(new CustomEvent('aparte-send', { detail, bubbles: true, composed: true }));
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(wrapper.emitted('messageSent')).toBeTruthy();
        expect(wrapper.emitted('messageSent')![0][0]).toEqual(detail);
    });

    it('emits action for a bubbling aparte:action DOM event', async () => {
        const wrapper = mount(AparteChat, { props: { messages: mockMessages } });
        await new Promise(resolve => setTimeout(resolve, 0));

        // A custom bubble action (registerBubbleAction) dispatches aparte:action, which
        // bubbles to the root — the wrapper re-emits it typed.
        const bubble = wrapper.element.querySelector('aparte-chat-bubble')!;
        bubble.dispatchEvent(new CustomEvent('aparte:action', {
            detail: { actionId: 'share', messageId: '1', role: 'user' },
            bubbles: true, composed: true,
        }));
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(wrapper.emitted('action')).toBeTruthy();
        expect((wrapper.emitted('action')![0][0] as any).actionId).toBe('share');
    });

    it('renders custom composer slot content in place of the default shell', () => {
        const wrapper = mount(AparteChat, {
            props: { messages: [] },
            slots: { composer: '<div class="my-custom-composer">custom</div>' }
        });

        const composer = wrapper.element.querySelector('aparte-composer')!;
        expect(composer.querySelector('.my-custom-composer')).not.toBeNull();
        expect(composer.querySelector('.aparte-composer-shell')).toBeNull();
    });

    it('renders a custom bubble via the `bubble` scoped slot in place of the native one', () => {
        const wrapper = mount(AparteChat, {
            props: { messages: [
                { id: '1', role: 'user', content: 'Hi', timestamp: 0 },
                { id: '2', role: 'assistant', content: 'Yo', timestamp: 1 },
            ] },
            slots: { bubble: `<template #bubble="{ message }"><div class="my-bubble" :data-id="message.id">{{ message.content }}</div></template>` },
        });
        const root = wrapper.element as HTMLElement;
        expect(root.querySelectorAll('aparte-chat-bubble').length).toBe(0);
        const custom = root.querySelectorAll('.my-bubble');
        expect(custom.length).toBe(2);
        expect(custom[0].getAttribute('data-id')).toBe('1');
        expect(custom[0].textContent).toBe('Hi');
    });

    it('re-renders the custom bubble when message content changes (streaming channel)', async () => {
        const wrapper = mount(AparteChat, {
            props: { messages: [{ id: '1', role: 'assistant', content: 'Hel', timestamp: 0 }] },
            slots: { bubble: `<template #bubble="{ message }"><div class="my-bubble">{{ message.content }}</div></template>` },
        });
        expect(wrapper.element.querySelector('.my-bubble')?.textContent).toBe('Hel');
        await wrapper.setProps({ messages: [{ id: '1', role: 'assistant', content: 'Hello world', timestamp: 0 }] });
        expect(wrapper.element.querySelector('.my-bubble')?.textContent).toBe('Hello world');
    });

    it('projects above-composer and footer slots into the default shell', () => {
        const wrapper = mount(AparteChat, {
            props: { messages: [] },
            slots: {
                'above-composer': '<div class="above-banner">banner</div>',
                'footer-left': '<span class="fl">L</span>',
                'footer-center': '<span class="fc">C</span>',
                'footer-right': '<span class="fr">R</span>',
            },
        });

        const root = wrapper.element as HTMLElement;
        const banner = root.querySelector('.above-banner')!;
        const composer = root.querySelector('aparte-composer')!;
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
        const wrapper = mount(AparteChat, { props: { messages: [] } });
        const composer = wrapper.element.querySelector('aparte-composer')!;
        expect(composer.querySelector('.aparte-composer-footer')).toBeNull();
    });

    it('applies placeholder and disabled as attributes on the composer (getter-only core props)', async () => {
        const wrapper = mount(AparteChat, { props: { messages: [], placeholder: 'Ask aparté…', disabled: true } });
        const composer = wrapper.element.querySelector('aparte-composer')!;
        // `.attr` binding must land on the attribute the getter reads — a plain
        // property-set would throw on the getter-only accessor and never apply.
        expect(composer.getAttribute('placeholder')).toBe('Ask aparté…');
        expect(composer.hasAttribute('disabled')).toBe(true);
        await wrapper.setProps({ disabled: false });
        expect(composer.hasAttribute('disabled')).toBe(false);
    });

    it('exposes scrollToBottom method', () => {
        const wrapper = mount(AparteChat, {
            props: {
                messages: []
            }
        });

        expect(wrapper.vm.scrollToBottom).toBeDefined();
        wrapper.vm.scrollToBottom();
    });

    it('forwards a per-instance config so components inside resolve it', async () => {
        const cfg = new AparteConfigClass();
        const wrapper = mount(AparteChat, { props: { messages: [], config: cfg } });
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(resolveConfig(wrapper.element as HTMLElement)).toBe(cfg);
    });

    it('resolves the global AparteConfig when no config prop is passed', async () => {
        const wrapper = mount(AparteChat, { props: { messages: [] } });
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(resolveConfig(wrapper.element as HTMLElement)).toBe(AparteConfig);
    });

    it('derives an SSR-stable host id from useId (not a random UUID)', async () => {
        const wrapper = mount(AparteChat, { props: { messages: [] } });
        await new Promise(resolve => setTimeout(resolve, 0));
        const host = wrapper.element as HTMLElement;
        expect(host.id).toMatch(/^aparte-chat-/);
        // Regression guard: crypto.randomUUID() at setup caused hydration mismatch (#9).
        expect(host.id).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    });
});
