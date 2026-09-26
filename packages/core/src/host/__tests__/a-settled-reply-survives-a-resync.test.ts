// @vitest-environment jsdom
/**
 * A finished reply keeps its rendered Markdown through the framework's next render.
 *
 * With an incremental Markdown provider installed alone (no one-shot provider), the
 * end of a turn settles each text segment by keeping what the parser wrote. Then the
 * framework renders again and calls `syncBubbles`, which always re-syncs the last
 * message: for a finished one it patches every segment `{ content, isStreaming: false }`,
 * a SECOND settle on a segment that already settled. The parser state was gone by then,
 * so the seam fell through to `renderMarkdown` — core's escape-and-`<br>` default — and
 * the reply collapsed to its raw source one render after it had finished.
 *
 * The incremental provider is a stand-in for `@aparte/plugin-streaming-markdown` (core
 * cannot import it). What is real is the host, the bubble and the seam between them.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { AparteChatHost, type AparteChatHostBinding } from '../aparte-chat-host.js';
import '../../components/viewport/aparte-chat-viewport.js';
import '../../components/bubble/aparte-chat-bubble.js';
import { aparteGlobalConfig } from '../../config/index.js';
import type { AparteMessage, AparteSegment } from '../../types/index.js';

/** Writes DOM as chunks arrive, the way `streaming-markdown` does — bold and list items only. */
function installIncrementalProvider(): void {
    const render = (md: string): string => md
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    aparteGlobalConfig.setStreamingMarkdownProvider((target: HTMLElement) => {
        let buffer = '';
        const paint = (): void => { target.innerHTML = render(buffer); };
        return {
            write: (chunk: string): void => { buffer += chunk; paint(); },
            end: paint,
        };
    });
}

async function setup() {
    const root = document.createElement('div');
    root.setAttribute('data-aparte-chat', '');
    root.id = 'h1';
    const viewport = document.createElement('aparte-chat-viewport');
    viewport.setAttribute('framework-managed', '');
    root.appendChild(viewport);
    document.body.appendChild(root);
    await vi.waitFor(() => expect(typeof (viewport as unknown as { addMessage?: unknown }).addMessage).toBe('function'));

    let messages: AparteMessage[] = [];
    const binding: AparteChatHostBinding = {
        hostId: 'h1', host: root, viewport,
        getMessages: () => messages,
        setMessages: (m) => { messages = m; },
        afterRender: (cb) => cb(),
    };
    const host = new AparteChatHost(binding, {});
    const teardown = host.bind();

    /** What a framework does after every render: paint missing bubbles, then reconcile. */
    const render = (): void => {
        for (const m of messages) {
            let bubble = viewport.querySelector(`aparte-chat-bubble[message-id="${m.id}"]`);
            if (!bubble) {
                bubble = document.createElement('aparte-chat-bubble');
                bubble.setAttribute('message-id', m.id);
                bubble.setAttribute('data-role', m.role);
                viewport.appendChild(bubble);
            }
            bubble.toggleAttribute('streaming', m.status === 'streaming');
        }
        host.syncBubbles();
    };
    const content = (segmentId: string): HTMLElement =>
        viewport.querySelector(`[data-segment-id="${segmentId}"] .aparte-segment-content`) as HTMLElement;
    const plainContent = (messageId: string): HTMLElement =>
        viewport.querySelector(`aparte-chat-bubble[message-id="${messageId}"] .aparte-content`) as HTMLElement;
    return { host, teardown, render, content, plainContent };
}

afterEach(() => {
    document.body.innerHTML = '';
    aparteGlobalConfig.reset();
});

describe('a reply streamed with only an incremental Markdown provider', () => {
    it('is still rendered after the framework re-syncs the finished message', async () => {
        installIncrementalProvider();
        const { host, teardown, render, content } = await setup();

        host.appendMessage({ id: 'a1', role: 'assistant', timestamp: 1, status: 'streaming', segments: [] });
        render();
        host.addSegment({ id: 't1', type: 'text', content: '' } as AparteSegment);
        host.appendToSegment('t1', 'A list:\n\n- **one**\n- **two**\n');
        host.updateMessage('a1', { status: 'completed' });

        expect(content('t1').querySelector('strong')?.textContent, 'rich once the turn ends').toBe('one');

        render();
        render();

        expect(content('t1').querySelectorAll('strong')).toHaveLength(2);
        expect(content('t1').innerHTML).not.toContain('**one**');
        teardown();
    });

    it('is still rendered after a re-sync when it streamed as plain content', async () => {
        // No segments: every reconcile hands the bubble its content with `setContent`,
        // which reaches the same seam through the bubble's own content element.
        installIncrementalProvider();
        const { host, teardown, render, plainContent } = await setup();

        host.appendMessage({ id: 'a1', role: 'assistant', timestamp: 1, status: 'streaming', content: '' });
        render();
        host.updateLastMessage('A list:\n\n- **one**\n', { append: true });
        render();
        host.updateLastMessage('- **two**\n', { append: true });
        render();
        host.updateMessage('a1', { status: 'completed' });

        expect(plainContent('a1').querySelector('strong')?.textContent, 'rich once the turn ends').toBe('one');

        render();
        render();

        expect(plainContent('a1').querySelectorAll('strong')).toHaveLength(2);
        expect(plainContent('a1').innerHTML).not.toContain('**one**');
        teardown();
    });
});
