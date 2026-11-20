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

function installProviders(): { written: string[]; oneShot: string[]; opened: string[]; ended: string[] } {
    const written: string[] = [];
    const oneShot: string[] = [];
    const opened: string[] = [];
    const ended: string[] = [];
    aparteGlobalConfig.setMarkdownProvider((markdown: string) => {
        oneShot.push(markdown);
        return `<p>${markdown}</p>`;
    });
    aparteGlobalConfig.setStreamingMarkdownProvider((target: HTMLElement) => {
        let buffer = '';
        opened.push('');
        return {
            write: (chunk: string): void => {
                buffer += chunk;
                written.push(buffer);
                target.textContent = buffer;
            },
            end: (): void => { ended.push(buffer); target.textContent = buffer; },
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
        expect(container.querySelector('aparte-chat-bubble[message-id="r"]')!.hasAttribute('streaming')).toBe(false);

        oneShot.length = 0;
        opened.length = 0;
        // Three chunks, each followed by the frame in which the wrapper re-syncs its list.
        for (const chunk of ['a **b', ' c**', ' d.']) {
            await act(async () => { ref.current!.appendToSegment('s1', chunk); });
            await frame();
        }
        // One stream, fed each chunk once, never redrawn whole while it is written.
        expect(opened).toHaveLength(1);
        expect(written.at(-1)).toBe('a **b c** d.');
        expect(oneShot.filter((m) => m.startsWith('a **b'))).toEqual([]);
        expect(ended).toEqual([]);

        await act(async () => { ref.current!.updateSegment('s1', { isStreaming: false } as never); });
        await frame();
        expect(ended).toEqual(['a **b c** d.']);
    });

    it.each(['text', 'thinking'] as const)('writes the first chunk of a %s segment incrementally', async (type) => {
        const { written, oneShot } = installProviders();
        const ref = React.createRef<AparteChatImperativeApi>();
        const { container } = render(<AparteChat ref={ref} />);
        await act(async () => {
            ref.current!.appendMessage({ id: 'r', role: 'assistant', content: '', timestamp: 1 });
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
