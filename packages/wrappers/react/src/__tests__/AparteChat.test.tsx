import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { AparteChat } from '../components/AparteChat';
import { registerAllComponents, resolveConfig, AparteConfig, AparteConfigClass } from '@aparte/core';
import type { AparteMessage } from '@aparte/core';

// Ensure components are registered
registerAllComponents();

// Mock scrollToBottom and other browser APIs
if (typeof window !== 'undefined') {
    if (!('scrollToBottom' in HTMLElement.prototype)) {
        (HTMLElement.prototype as any).scrollToBottom = vi.fn();
    }

    // Stub requestAnimationFrame to avoid async leaks
    window.requestAnimationFrame = (callback) => setTimeout(callback, 0) as any;
    window.cancelAnimationFrame = (id) => clearTimeout(id);

    // Stub ResizeObserver if not present
    if (!window.ResizeObserver) {
        window.ResizeObserver = class {
            observe() { }
            unobserve() { }
            disconnect() { }
        } as any;
    }
}

describe('AparteChat React Wrapper', () => {
    const mockMessages: AparteMessage[] = [
        { id: '1', role: 'user', content: 'Hello', timestamp: Date.now() },
        { id: '2', role: 'assistant', content: 'Hi there!', timestamp: Date.now() + 1000 },
    ];

    const mockOnMessageSent = vi.fn();

    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it('renders correct number of messages', () => {
        const { container } = render(
            <AparteChat messages={mockMessages} onMessageSent={mockOnMessageSent} />,
        );

        const bubbles = container.querySelectorAll('aparte-chat-bubble');
        expect(bubbles.length).toBe(2);
        expect(bubbles[0].getAttribute('message-id')).toBe('1');
        expect(bubbles[1].getAttribute('message-id')).toBe('2');
    });

    it('shows emptyState inside the viewport when there are no messages, hides it once populated', () => {
        const { container, rerender } = render(
            <AparteChat messages={[]} onMessageSent={mockOnMessageSent} emptyState={<div className="welcome">say hi</div>} />,
        );
        expect(container.querySelector('aparte-chat-viewport .welcome')).not.toBeNull();
        rerender(
            <AparteChat messages={mockMessages} onMessageSent={mockOnMessageSent} emptyState={<div className="welcome">say hi</div>} />,
        );
        expect(container.querySelector('.welcome')).toBeNull();
    });

    it('adds the --auto-center modifier + data-aparte-empty only while centerWhenEmpty and empty', () => {
        const { container, rerender } = render(
            <AparteChat messages={[]} onMessageSent={mockOnMessageSent} centerWhenEmpty />,
        );
        const box = container.querySelector('.aparte-chat-container') as HTMLElement;
        expect(box.classList.contains('aparte-chat-container--auto-center')).toBe(true);
        expect(box.getAttribute('data-aparte-empty')).toBe('');
        // First message → the empty flag drops (the composer slides to the bottom).
        rerender(<AparteChat messages={mockMessages} onMessageSent={mockOnMessageSent} centerWhenEmpty />);
        expect(box.getAttribute('data-aparte-empty')).toBeNull();
        expect(box.classList.contains('aparte-chat-container--auto-center')).toBe(true);
    });

    it('never opts in when centerWhenEmpty is off (default)', () => {
        const { container } = render(
            <AparteChat messages={[]} onMessageSent={mockOnMessageSent} />,
        );
        const box = container.querySelector('.aparte-chat-container') as HTMLElement;
        expect(box.classList.contains('aparte-chat-container--auto-center')).toBe(false);
        expect(box.getAttribute('data-aparte-empty')).toBeNull();
    });

    it('renders a custom bubble via renderBubble in place of the native one', () => {
        const { container } = render(
            <AparteChat
                messages={mockMessages}
                onMessageSent={mockOnMessageSent}
                renderBubble={(m) => (
                    <div className="my-bubble" data-id={m.id} data-role={m.role}>{m.content}</div>
                )}
            />,
        );

        // Native bubble is replaced entirely.
        expect(container.querySelectorAll('aparte-chat-bubble').length).toBe(0);
        const custom = container.querySelectorAll('.my-bubble');
        expect(custom.length).toBe(2);
        expect(custom[0].getAttribute('data-id')).toBe('1');
        expect(custom[0].textContent).toBe('Hello');
        expect(custom[1].getAttribute('data-role')).toBe('assistant');
    });

    it('re-renders the custom bubble when the message content changes (streaming channel)', () => {
        const { container, rerender } = render(
            <AparteChat
                messages={[{ id: '1', role: 'assistant', content: 'Hel', timestamp: 0 }]}
                onMessageSent={mockOnMessageSent}
                renderBubble={(m) => <div className="my-bubble">{m.content}</div>}
            />,
        );
        expect(container.querySelector('.my-bubble')?.textContent).toBe('Hel');

        // The host updates the reactive message list per token; simulate that.
        rerender(
            <AparteChat
                messages={[{ id: '1', role: 'assistant', content: 'Hello world', timestamp: 0 }]}
                onMessageSent={mockOnMessageSent}
                renderBubble={(m) => <div className="my-bubble">{m.content}</div>}
            />,
        );
        expect(container.querySelector('.my-bubble')?.textContent).toBe('Hello world');
    });

    it('shows typing status when isTyping is true', () => {
        const { container, rerender } = render(
            <AparteChat messages={[]} isTyping={false} onMessageSent={mockOnMessageSent} />,
        );

        const status = container.querySelector('aparte-chat-status');
        expect(status?.getAttribute('visible')).toBeNull();

        rerender(
            <AparteChat messages={[]} isTyping={true} onMessageSent={mockOnMessageSent} />,
        );

        expect(status?.getAttribute('visible')).toBe('');
    });

    it('calls onMessageSent when the composer dispatches aparte-send', () => {
        const { container } = render(
            <AparteChat messages={[]} onMessageSent={mockOnMessageSent} />,
        );

        const composer = container.querySelector('aparte-composer');
        const detail = { content: 'New message', timestamp: Date.now() };

        if (composer) {
            const event = new CustomEvent('aparte-send', { detail, bubbles: true, composed: true });
            composer.dispatchEvent(event);
        }

        expect(mockOnMessageSent).toHaveBeenCalledWith(detail);
    });

    it('forwards the bubbling aparte:action DOM event as the typed onAction prop', () => {
        const onAction = vi.fn();
        const { container } = render(
            <AparteChat messages={mockMessages} onMessageSent={mockOnMessageSent} onAction={onAction} />,
        );
        // A custom bubble action (registerAction with zones: ['bubble']) dispatches
        // aparte:action, which bubbles to the host root — the wrapper surfaces it as onAction.
        const bubble = container.querySelector('aparte-chat-bubble')!;
        bubble.dispatchEvent(new CustomEvent('aparte:action', {
            detail: { actionId: 'share', messageId: '1', role: 'user', zone: 'bubble' },
            bubbles: true, composed: true,
        }));
        expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ actionId: 'share' }));
    });

    it('renders custom composer content in place of the default shell', () => {
        const { container } = render(
            <AparteChat
                messages={[]}
                onMessageSent={mockOnMessageSent}
                composer={<div className="my-custom-composer">custom</div>}
            />,
        );

        const composer = container.querySelector('aparte-composer');
        expect(composer?.querySelector('.my-custom-composer')).not.toBeNull();
        expect(composer?.querySelector('.aparte-composer-shell')).toBeNull();
    });

    it('projects above-composer and footer slots into the default shell', () => {
        const { container } = render(
            <AparteChat
                messages={[]}
                onMessageSent={mockOnMessageSent}
                aboveComposer={<div className="above-banner">banner</div>}
                footerLeft={<span className="fl">L</span>}
                footerCenter={<span className="fc">C</span>}
                footerRight={<span className="fr">R</span>}
            />,
        );

        // above-composer renders before the composer element.
        const banner = container.querySelector('.above-banner');
        const composer = container.querySelector('aparte-composer');
        expect(banner).not.toBeNull();
        expect(banner!.compareDocumentPosition(composer!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

        // footer slots land inside the default shell's footer row, in order.
        const footer = composer!.querySelector('.aparte-composer-footer');
        expect(footer).not.toBeNull();
        expect(footer!.querySelector('.fl')?.textContent).toBe('L');
        expect(footer!.querySelector('.fc')?.textContent).toBe('C');
        expect(footer!.querySelector('.fr')?.textContent).toBe('R');
    });

    it('omits the footer row entirely when no footer slot is provided', () => {
        const { container } = render(
            <AparteChat messages={[]} onMessageSent={mockOnMessageSent} />,
        );
        const composer = container.querySelector('aparte-composer');
        expect(composer?.querySelector('.aparte-composer-footer')).toBeNull();
    });

    it('exposes scrollToBottom via ref', () => {
        const ref = React.createRef<any>();
        render(
            <AparteChat messages={[]} onMessageSent={mockOnMessageSent} ref={ref} />,
        );

        expect(ref.current?.scrollToBottom).toBeDefined();
        ref.current?.scrollToBottom();
    });

    it('forwards a per-instance config so components inside resolve it', () => {
        const cfg = new AparteConfigClass();
        const { container } = render(
            <AparteChat messages={[]} config={cfg} onMessageSent={mockOnMessageSent} />,
        );
        const host = container.querySelector('[id^="aparte-chat-"]') as HTMLElement;
        expect(resolveConfig(host)).toBe(cfg);
    });

    it('resolves the global AparteConfig when no config prop is passed', () => {
        const { container } = render(
            <AparteChat messages={[]} onMessageSent={mockOnMessageSent} />,
        );
        const host = container.querySelector('[id^="aparte-chat-"]') as HTMLElement;
        expect(resolveConfig(host)).toBe(AparteConfig);
    });

    it('derives an SSR-stable host id from useId (not a random UUID)', () => {
        const { container } = render(
            <AparteChat messages={[]} onMessageSent={mockOnMessageSent} />,
        );
        const host = container.querySelector('[id^="aparte-chat-"]') as HTMLElement | null;
        expect(host).not.toBeNull();
        // Regression guard: crypto.randomUUID() at render caused hydration mismatch.
        expect(host!.id).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    });
});
