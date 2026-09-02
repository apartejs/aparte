import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { AparteChat } from '../components/AparteChat';
import { registerAllComponents, resolveConfig, aparteGlobalConfig, AparteConfig, type AparteChatImperativeApi } from '@aparte/core';
import type { AparteMessage } from '@aparte/core';
import { AparteConversationManager } from '@aparte/core';
import type { AparteConversation, AparteStorageAdapter } from '@aparte/core';

/**
 * The smallest thing the conversation lifecycle needs: somewhere to put a
 * conversation. Without a manager on the resolved config the controller runs in
 * degraded mode — the optimistic user bubble still appears and NOTHING is created —
 * so `onConversationCreated` can only be asserted with one registered.
 */
async function memoryManager(): Promise<AparteConversationManager> {
    const store = new Map<string, AparteConversation>();
    const adapter: AparteStorageAdapter = {
        async loadAll() { return [...store.values()]; },
        async save(c) { store.set(c.id, c); },
        async delete(id) { store.delete(id); },
    };
    const manager = new AparteConversationManager(adapter);
    await manager.init();
    return manager;
}

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

    it('overlayComposer puts overlay-composer on the shell; off by default', () => {
        const on = render(<AparteChat messages={[]} overlayComposer />);
        expect(on.container.querySelector('[data-aparte-chat]')!.hasAttribute('overlay-composer')).toBe(true);
        const off = render(<AparteChat messages={[]} />);
        expect(off.container.querySelector('[data-aparte-chat]')!.hasAttribute('overlay-composer')).toBe(false);
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

    it('an uncontrolled <AparteChat> (no messages prop) keeps what it appended across re-renders', async () => {
        // The omitted-prop default used to be a fresh `[]` on every render: the
        // parent-push effect compared it by identity, applied the empty list on every
        // render — wiping the thread the host had just appended — and looped.
        const ref = React.createRef<AparteChatImperativeApi>();
        const { container, rerender } = render(<AparteChat ref={ref} onMessageSent={mockOnMessageSent} />);
        await act(async () => {
            ref.current?.appendMessage({ id: 'u1', role: 'user', content: 'kept', timestamp: 1 });
        });
        rerender(<AparteChat ref={ref} onMessageSent={mockOnMessageSent} placeholder="again" />);
        rerender(<AparteChat ref={ref} onMessageSent={mockOnMessageSent} placeholder="and again" />);
        expect(container.querySelectorAll('aparte-chat-bubble').length).toBe(1);
        expect(ref.current?.getMessages().map((m) => m.id)).toEqual(['u1']);
    });

    it('exposes getViewport() on the handle (cross-wrapper accessor)', () => {
        const ref = React.createRef<AparteChatImperativeApi>();
        const { container } = render(<AparteChat ref={ref} messages={[]} />);
        const viewport = ref.current?.getViewport();
        expect(viewport).not.toBeNull();
        expect(viewport).toBe(container.querySelector('aparte-chat-viewport'));
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

    // Attachments are opt-in across core and all four wrappers: the picker is only
    // honest when the host consumes `detail.files` (an AparteClient does; a
    // hand-rolled loop must). Same three assertions in every wrapper's suite so a
    // divergence in one of them fails the gate.
    it('mounts no attachment primitives by default', () => {
        const { container } = render(<AparteChat messages={[]} onMessageSent={mockOnMessageSent} />);
        expect(container.querySelector('aparte-composer-add-attachment')).toBeNull();
        expect(container.querySelector('aparte-composer-attachments')).toBeNull();
    });

    // Parity with core's <aparte-chat>, whose default composition ships the presenter:
    // the approval gate and requestUserInput() ask through it, so a wrapper without one
    // could not honour either — and the "no presenter" warning named a tag this wrapper
    // never renders.
    it('renders the elicitation presenter inside the host by default, before the composer', () => {
        const { container } = render(<AparteChat messages={[]} onMessageSent={mockOnMessageSent} />);
        const host = container.querySelector('[data-aparte-chat]')!;
        const presenter = host.querySelector(':scope > aparte-elicitation');
        expect(presenter).not.toBeNull();
        expect(presenter!.nextElementSibling!.tagName.toLowerCase()).toBe('aparte-composer');
    });

    it('omits the presenter with elicitation={false}', () => {
        const { container } = render(<AparteChat messages={[]} onMessageSent={mockOnMessageSent} elicitation={false} />);
        expect(container.querySelector('aparte-elicitation')).toBeNull();
    });

    // A utility-first app sizes the chat column from JSX; core's own class must survive.
    it('merges className and style onto the root element', () => {
        const { container } = render(
            <AparteChat messages={[]} onMessageSent={mockOnMessageSent} className="flex-1 min-h-0" style={{ minHeight: 4 }} />,
        );
        const host = container.querySelector('[data-aparte-chat]') as HTMLElement;
        expect(host.classList.contains('aparte-chat-container')).toBe(true);
        expect(host.classList.contains('flex-1')).toBe(true);
        expect(host.classList.contains('min-h-0')).toBe(true);
        expect(host.style.minHeight).toBe('4px');
    });

    it('mounts the picker and the chips strip with attachments', () => {
        const { container } = render(<AparteChat messages={[]} onMessageSent={mockOnMessageSent} attachments />);
        expect(container.querySelector('.aparte-composer-shell > aparte-composer-attachments')).not.toBeNull();
        const row = container.querySelector('.aparte-composer-row')!;
        expect(row.firstElementChild!.tagName.toLowerCase()).toBe('aparte-composer-add-attachment');
    });

    it('leaves a custom composer alone even with attachments', () => {
        const { container } = render(
            <AparteChat
                messages={[]}
                onMessageSent={mockOnMessageSent}
                attachments
                composer={<div className="mine"><aparte-composer-input /></div>}
            />,
        );
        expect(container.querySelector('.mine')).not.toBeNull();
        expect(container.querySelector('aparte-composer-add-attachment')).toBeNull();
    });

    // Parity across the four wrappers: an empty assistant message with NO status is
    // a reply on its way, so the bubble must render as in-flight (waiting indicator,
    // no action bar) instead of as a finished, empty answer. One rule, core's
    // `isAwaitingReply`, asserted in all four suites so it can't drift.
    it('marks an empty assistant message (no status) as awaiting a reply', () => {
        const { container } = render(
            <AparteChat messages={[{ id: 'a1', role: 'assistant', content: '', timestamp: 0 }]} />,
        );
        const bubble = container.querySelector('aparte-chat-bubble[message-id="a1"]')!;
        expect(bubble.getAttribute('streaming')).toBe('');
    });

    it('feeds a custom bubble from injectTokenStream (state is the wrapper contract)', async () => {
        // A custom bubble gets NO imperative push: the viewport looks bubbles up by
        // `message-id` (or `data-aparte-bubble`), and a user-rendered node has
        // neither. In a wrapper that is by design — the bubble re-renders from the
        // message list. Which only works because streamTokens now syncs that list;
        // before, the DOM had the reply and React state still had `content: ''`.
        const ref = React.createRef<AparteChatImperativeApi>();
        const { container } = render(
            <AparteChat
                ref={ref}
                messages={[{ id: 'a1', role: 'assistant', content: '', timestamp: 0 }]}
                renderBubble={(m) => <div className="mine">{m.content}</div>}
            />,
        );
        expect(container.querySelector('.mine')?.textContent).toBe('');

        await act(async () => {
            await ref.current?.injectTokenStream('a1', (async function* () {
                yield 'Hel'; yield 'lo';
            })());
        });

        expect(container.querySelector('.mine')?.textContent).toBe('Hello');
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

    it('forwards the bubbling aparte-action DOM event as the typed onAction prop', () => {
        const onAction = vi.fn();
        const { container } = render(
            <AparteChat messages={mockMessages} onMessageSent={mockOnMessageSent} onAction={onAction} />,
        );
        // A custom bubble action (registerAction with zones: ['bubble']) dispatches
        // aparte-action, which bubbles to the host root — the wrapper surfaces it as onAction.
        const bubble = container.querySelector('aparte-chat-bubble')!;
        bubble.dispatchEvent(new CustomEvent('aparte-action', {
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

    it('projects above-composer and the toolbar into the default shell', () => {
        const { container } = render(
            <AparteChat
                messages={[]}
                onMessageSent={mockOnMessageSent}
                aboveComposer={<div className="above-banner">banner</div>}
                toolbar={<>
                    <span className="mode">mode</span>
                    <span className="model" style={{ marginInlineStart: 'auto' }}>model</span>
                </>}
            />,
        );

        // above-composer renders before the composer element.
        const banner = container.querySelector('.above-banner');
        const composer = container.querySelector('aparte-composer');
        expect(banner).not.toBeNull();
        expect(banner!.compareDocumentPosition(composer!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

        // The toolbar lands in core's element, and the DOM order is the placement: the
        // wrapper adds no left/center/right of its own.
        const toolbar = composer!.querySelector('aparte-composer-toolbar');
        expect(toolbar).not.toBeNull();
        expect([...toolbar!.children].map((c) => c.className)).toEqual(['mode', 'model']);
    });

    it('projects emptyState while there are no messages, and drops it on the first', () => {
        // Every example fills this slot and NOTHING proved it — not one unit test in
        // any of the four wrappers, and no browser assertion either. Its contract is two
        // halves ("Replaced by the message list on the first message") and the second is
        // the one that silently rots: a welcome block still showing under a live
        // conversation is the visible bug.
        const { container, rerender } = render(
            <AparteChat
                messages={[]}
                onMessageSent={mockOnMessageSent}
                emptyState={<div className="welcome-block">welcome</div>}
            />,
        );
        expect(container.querySelector('.welcome-block')).not.toBeNull();

        rerender(
            <AparteChat
                messages={[{ id: '1', role: 'user', content: 'hi', timestamp: 0 }]}
                onMessageSent={mockOnMessageSent}
                emptyState={<div className="welcome-block">welcome</div>}
            />,
        );
        expect(container.querySelector('.welcome-block')).toBeNull();
    });

    it('renders no toolbar element at all when no toolbar is given', () => {
        const { container } = render(
            <AparteChat messages={[]} onMessageSent={mockOnMessageSent} />,
        );
        const composer = container.querySelector('aparte-composer');
        // Not "rendered and hidden": absent. An empty row would still be a row in the
        // accessibility tree and in anyone's querySelector.
        expect(composer?.querySelector('aparte-composer-toolbar')).toBeNull();
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
        const cfg = new AparteConfig();
        const { container } = render(
            <AparteChat messages={[]} config={cfg} onMessageSent={mockOnMessageSent} />,
        );
        const host = container.querySelector('[id^="aparte-chat-"]') as HTMLElement;
        expect(resolveConfig(host)).toBe(cfg);
    });

    it('resolves `aparteGlobalConfig` when no config prop is passed', () => {
        const { container } = render(
            <AparteChat messages={[]} onMessageSent={mockOnMessageSent} />,
        );
        const host = container.querySelector('[id^="aparte-chat-"]') as HTMLElement;
        expect(resolveConfig(host)).toBe(aparteGlobalConfig);
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

    // ── The three callbacks nothing asserted ─────────────────────────────
    //
    // `messageAppended` and `conversationCreated` were asserted by no test on any of
    // the four wrappers, and `messagesChange` only inside one Angular streaming
    // scenario. The parity guard proves each is declared and dispatched; only a test
    // proves the payload that arrives is the one the JSDoc promises.

    it('calls onMessageAppended with the appended message, and not onMessagesChange', async () => {
        const onMessagesChange = vi.fn();
        const onMessageAppended = vi.fn();
        const ref = React.createRef<AparteChatImperativeApi>();
        render(
            <AparteChat
                ref={ref}
                onMessagesChange={onMessagesChange}
                onMessageAppended={onMessageAppended}
            />,
        );

        await act(async () => {
            ref.current?.appendMessage({ id: 'u1', role: 'user', content: 'hello', timestamp: 1 });
        });

        expect(onMessageAppended).toHaveBeenCalledTimes(1);
        expect(onMessageAppended.mock.calls[0][0]).toMatchObject({ id: 'u1', content: 'hello' });
        // The silence is the contract, not an oversight: echoing the local list back
        // on an append would overwrite a controlled parent's authoritative one and
        // drop the message it pushed in the same tick. `onMessageAppended` is the
        // append-specific signal instead.
        expect(onMessagesChange).not.toHaveBeenCalled();
    });

    it('calls onMessagesChange with the whole path when a message is updated', async () => {
        const onMessagesChange = vi.fn();
        const ref = React.createRef<AparteChatImperativeApi>();
        render(<AparteChat ref={ref} onMessagesChange={onMessagesChange} />);

        await act(async () => {
            ref.current?.appendMessage({ id: 'u1', role: 'user', content: 'draft', timestamp: 1 });
            ref.current?.updateMessage('u1', { content: 'edited' });
        });

        expect(onMessagesChange).toHaveBeenCalledTimes(1);
        const last = onMessagesChange.mock.calls.at(-1)![0] as AparteMessage[];
        expect(last.map((m) => m.id)).toEqual(['u1']);
        expect(last[0]!.content).toBe('edited');
    });

    it('calls onConversationCreated on the first send once a manager is registered', async () => {
        const cfg = new AparteConfig();
        cfg.setConversationManager(await memoryManager());
        const onConversationCreated = vi.fn();
        const { container } = render(
            <AparteChat messages={[]} config={cfg} onConversationCreated={onConversationCreated} />,
        );

        container.querySelector('aparte-composer')!.dispatchEvent(
            new CustomEvent('aparte-send', {
                detail: { content: 'first message' },
                bubbles: true, composed: true,
            }),
        );

        // Creation is async (the adapter is): wait for the callback, not for a delay.
        await vi.waitFor(() => expect(onConversationCreated).toHaveBeenCalledTimes(1));
        expect(typeof onConversationCreated.mock.calls[0][0]).toBe('string');
    });
});
