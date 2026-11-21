/**
 * A reply streamed by hand through a framework chat is written incrementally, chunk by chunk.
 *
 * The flow is the "bring your own loop" guide's: `appendMessage` with no status, `addSegment`,
 * then `appendToSegment` in a loop. A wrapper draws the bubble's `streaming` attribute from
 * `isAwaitingReply`, which turns false as soon as the message has a segment, so the attribute
 * is gone while the chunks arrive. A missing `isStreaming` flag read from that attribute sent
 * every chunk down the one-shot path: the whole text redrawn on each token, an unclosed `**`
 * shown raw until it closed. An append is a stream whatever the attribute says.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { AparteChat } from '../components/AparteChat';
import { registerAllComponents, aparteGlobalConfig, type AparteChatImperativeApi } from '@aparte/core';

beforeEach(() => registerAllComponents());
afterEach(() => {
    cleanup();
    aparteGlobalConfig.reset();
});

function installProviders(): { written: string[]; oneShot: string[]; opened: Set<number>; ended: string[] } {
    const written: string[] = [];
    const oneShot: string[] = [];
    // The streams that were written to: the empty message content's own stream opens and ends
    // with nothing in it, and is no stream of the segment's.
    const opened = new Set<number>();
    const ended: string[] = [];
    let streams = 0;
    aparteGlobalConfig.setMarkdownProvider((markdown: string) => {
        oneShot.push(markdown);
        return `<p>${markdown}</p>`;
    });
    aparteGlobalConfig.setStreamingMarkdownProvider((target: HTMLElement) => {
        let buffer = '';
        const id = streams++;
        return {
            write: (chunk: string): void => {
                buffer += chunk;
                if (chunk) opened.add(id);
                written.push(buffer);
                target.textContent = buffer;
            },
            end: (): void => { if (buffer) ended.push(buffer); target.textContent = buffer; },
        };
    });
    return { written, oneShot, opened, ended };
}

const frame = (): Promise<void> => act(async () => { await new Promise((r) => setTimeout(r, 40)); });

describe('a reply streamed by hand through <AparteChat>', () => {
    it.each(['text', 'thinking'] as const)('writes each chunk of a %s segment into one stream, ended by its flag', async (type) => {
        const { written, oneShot, opened, ended } = installProviders();
        const ref = React.createRef<AparteChatImperativeApi>();
        const { container } = render(<AparteChat ref={ref} />);
        await act(async () => {
            ref.current!.appendMessage({ id: 'r', role: 'assistant', content: '', timestamp: 1 });
            ref.current!.addSegment({ id: 's1', type, content: '' } as never);
        });
        await frame();
        // Written by hand, it streams until its status or its flag ends it, as without a framework.
        expect(container.querySelector('aparte-chat-bubble[message-id="r"]')!.hasAttribute('streaming')).toBe(true);

        oneShot.length = 0;
        opened.clear();
        // Three chunks, each followed by the frame in which the wrapper re-syncs its list.
        for (const chunk of ['a **b', ' c**', ' d.']) {
            await act(async () => { ref.current!.appendToSegment('s1', chunk); });
            await frame();
        }
        // One stream, fed each chunk once, never redrawn whole while it is written.
        expect(opened.size).toBe(1);
        expect(written.at(-1)).toBe('a **b c** d.');
        expect(oneShot.filter((m) => m.startsWith('a **b'))).toEqual([]);
        expect(ended).toEqual([]);

        await act(async () => { ref.current!.updateSegment('s1', { isStreaming: false } as never); });
        await frame();
        expect(ended).toEqual(['a **b c** d.']);
    });

    // The usual case, with a real wait before the first token: the empty shell is painted first,
    // streaming. Its first segment took the attribute away, and the bubble read it as the reply's
    // end: the segment was settled, and every chunk after it drawn whole.
    it.each(['text', 'thinking'] as const)('writes a %s segment incrementally when the shell was painted before it', async (type) => {
        const { written, oneShot, opened, ended } = installProviders();
        const ref = React.createRef<AparteChatImperativeApi>();
        const { container } = render(<AparteChat ref={ref} />);
        await act(async () => { ref.current!.appendMessage({ id: 'r', role: 'assistant', content: '', timestamp: 1 }); });
        await frame();
        expect(container.querySelector('aparte-chat-bubble[message-id="r"]')!.hasAttribute('streaming')).toBe(true);
        oneShot.length = 0;
        opened.clear();
        await act(async () => { ref.current!.addSegment({ id: 's1', type, content: '' } as never); });
        await frame();
        for (const chunk of ['a **b', ' c**', ' d.']) {
            await act(async () => { ref.current!.appendToSegment('s1', chunk); });
            await frame();
        }
        expect(opened.size).toBe(1);
        expect(written.at(-1)).toBe('a **b c** d.');
        expect(oneShot.filter((m) => m.startsWith('a **b'))).toEqual([]);
        expect(ended).toEqual([]);
        // The reply's status ends it, as without a framework.
        await act(async () => { ref.current!.updateMessage('r', { status: 'completed' }); });
        await frame();
        expect(ended).toEqual(['a **b c** d.']);
    });

    it.each(['text', 'thinking'] as const)('writes the first chunk of a %s segment incrementally', async (type) => {
        const { written, oneShot } = installProviders();
        const ref = React.createRef<AparteChatImperativeApi>();
        const { container } = render(<AparteChat ref={ref} />);
        // A reply that already has words (not an empty shell): written into by hand, it is not
        // marked streaming, so the wrapper draws no attribute, and an append must still stream.
        await act(async () => {
            ref.current!.appendMessage({ id: 'r', role: 'assistant', content: 'Earlier words.', timestamp: 1 });
            ref.current!.addSegment({ id: 's1', type, content: '' } as never);
        });
        await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
        const bubble = container.querySelector('aparte-chat-bubble[message-id="r"]')!;
        // The precondition the defect needs: the wrapper has dropped the attribute.
        expect(bubble.hasAttribute('streaming')).toBe(false);

        oneShot.length = 0;
        await act(async () => {
            ref.current!.appendToSegment('s1', 'a **b');
        });
        expect(written.some((w) => w.endsWith('a **b'))).toBe(true);
        expect(oneShot.filter((m) => m.includes('a **b'))).toEqual([]);
    });
});
