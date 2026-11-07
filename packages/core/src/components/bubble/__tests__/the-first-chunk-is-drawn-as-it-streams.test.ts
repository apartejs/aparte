// @vitest-environment jsdom
/**
 * The first chunk of a streaming segment is drawn by the streaming renderer, like every chunk after it.
 *
 * A segment is drawn by its renderer's `render` and then `setup`, both in the same task;
 * `update` only runs from the next chunk on. `render` went through the one-shot provider,
 * which reads a half-written reply as finished text: with `@aparte/plugin-marked/streaming`
 * (or marked beside `@aparte/plugin-streaming-markdown`) the first frame of
 * `Done: **Book ` showed its `**` raw, and only the second chunk, through the streaming
 * renderer, made it bold. One frame, tens of milliseconds on a real model: invisible to the
 * eye, caught by recording the DOM against a scripted model.
 *
 * The providers are stand-ins (core cannot import a plugin): the one-shot one only knows a
 * closed `**x**`, the streaming one also closes the marker still open, as remend does.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat-bubble.js';
import { populateBubbleFromMessage } from '../bubble-sync.js';
import { aparteGlobalConfig } from '../../../config/index.js';
import type { AparteMessage, AparteSegment } from '../../../types/index.js';

interface BubbleEl extends HTMLElement {
    addSegment(segment: AparteSegment): void;
    setSegments(segments: AparteSegment[]): void;
    updateSegment(id: string, updates: Partial<AparteSegment>): void;
    updateMessage(updates: Record<string, unknown>): void;
}

const bold = (md: string): string => md.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

/** Closes a `**` still open, as remend does before marked reads the block being written. */
const heal = (md: string): string => ((md.match(/\*\*/g) ?? []).length % 2 ? `${md.trimEnd()}**` : md);

let streamWrites = 0;
let ended: string[] = [];

function install(): void {
    aparteGlobalConfig.setMarkdownProvider((md) => `<p class="one-shot">${bold(md)}</p>`);
    aparteGlobalConfig.setStreamingMarkdownProvider((target: HTMLElement) => {
        let buffer = '';
        const paint = (): void => { target.innerHTML = `<p class="streamed">${bold(heal(buffer))}</p>`; };
        return {
            write: (chunk: string): void => { streamWrites++; buffer += chunk; paint(); },
            end: (): void => { ended.push(buffer); target.innerHTML = `<p class="streamed">${bold(buffer)}</p>`; },
        };
    });
}

const textOf = (el: Element, id: string): Element =>
    el.querySelector(`[data-segment-id="${id}"] .aparte-segment-content`)!;

function mount(): BubbleEl {
    const el = document.createElement('aparte-chat-bubble') as BubbleEl;
    el.setAttribute('message-id', 'm1');
    el.setAttribute('data-role', 'assistant');
    document.body.appendChild(el);
    el.updateMessage({ status: 'streaming' });
    return el;
}

describe('the first chunk of a streaming segment', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        aparteGlobalConfig.reset();
        streamWrites = 0;
        ended = [];
    });

    /*
     * The stream parser's text carries no `isStreaming` flag: `update` reads a missing flag
     * as "still arriving", `setup` as "finished" (a restored message carries none either).
     * Only the bubble knows its message is streaming, so it is the bubble that says so.
     */
    describe('with no flag of its own, in a message that streams', () => {
        it('is drawn by the streaming renderer when added', () => {
            install();
            const el = mount();
            el.addSegment({ id: 's1', type: 'text', content: 'Done: **Book ' });

            expect(textOf(el, 's1').querySelector('strong')?.textContent).toBe('Book');
            expect(textOf(el, 's1').textContent).not.toContain('**');
        });

        it('is drawn by the streaming renderer when a framework host redraws the bubble', () => {
            install();
            const el = mount();
            const message = {
                id: 'm1',
                role: 'assistant',
                status: 'streaming',
                content: '',
                segments: [
                    { id: 's0', type: 'text', content: 'I can add **that**.' },
                    { id: 's1', type: 'text', content: 'Done: **Book ' },
                ],
            } as unknown as AparteMessage;
            populateBubbleFromMessage(el, message);

            expect(textOf(el, 's1').querySelector('strong')?.textContent).toBe('Book');
            // Only the last segment is arriving: the one before it is finished, and one-shot.
            expect(textOf(el, 's0').querySelector('.one-shot strong')?.textContent).toBe('that');

            // The host's next sync carries the next chunk, then the end of the message.
            populateBubbleFromMessage(el, { ...message, segments: [message.segments![0]!, { id: 's1', type: 'text', content: 'Done: **Book the dentist**.' }] } as AparteMessage);
            populateBubbleFromMessage(el, { ...message, status: 'completed', segments: [message.segments![0]!, { id: 's1', type: 'text', content: 'Done: **Book the dentist**.' }] } as AparteMessage);
            // The host's syncs push every segment's content, so `s0` is settled too: not this fix's.
            expect(ended).toContain('Done: **Book the dentist**.');
            expect(textOf(el, 's1').textContent).toBe('Done: Book the dentist.');
        });

        it('is left finished when set by hand: setSegments infers nothing', () => {
            install();
            const el = mount();
            el.setSegments([{ id: 's1', type: 'text', content: 'Set at **once**.' }]);

            expect(textOf(el, 's1').querySelector('.one-shot strong')?.textContent).toBe('once');
            expect(streamWrites).toBe(0);
        });

        it('is settled when the message stops streaming', () => {
            install();
            const el = mount();
            el.addSegment({ id: 's1', type: 'text', content: 'Done: **Book the dentist**.' });
            el.updateMessage({ status: 'completed' });

            expect(ended).toEqual(['Done: **Book the dentist**.']);
            expect(textOf(el, 's1').textContent).toBe('Done: Book the dentist.');
        });

        it('is drawn by the streaming renderer in a reasoning block', () => {
            install();
            const el = mount();
            el.addSegment({ id: 'r1', type: 'thinking', content: 'Check the **due' });

            const content = el.querySelector('[data-segment-id="r1"] .aparte-thinking-content')!;
            expect(content.querySelector('strong')?.textContent).toBe('due');
        });
    });

    it('stays one-shot in a message that is not streaming (a restored one)', () => {
        install();
        const el = document.createElement('aparte-chat-bubble') as BubbleEl;
        el.setAttribute('data-role', 'assistant');
        document.body.appendChild(el);
        el.setSegments([{ id: 's1', type: 'text', content: 'Done: **Book the dentist**' }]);

        expect(textOf(el, 's1').querySelector('.one-shot strong')?.textContent).toBe('Book the dentist');
        expect(streamWrites).toBe(0);
    });

    it('is drawn by the streaming renderer in a text segment', () => {
        install();
        const el = mount();
        el.addSegment({ id: 's1', type: 'text', content: 'Done: **Book ', isStreaming: true });

        const content = el.querySelector('[data-segment-id="s1"] .aparte-segment-content')!;
        expect(content.querySelector('strong')?.textContent).toBe('Book');
        expect(content.textContent).not.toContain('**');
    });

    it('is written once: the next chunk carries on from it', () => {
        install();
        const el = mount();
        el.addSegment({ id: 's1', type: 'text', content: 'Done: **Book ', isStreaming: true });
        el.updateSegment('s1', { content: 'Done: **Book the dentist** is on your list.' });

        const content = el.querySelector('[data-segment-id="s1"] .aparte-segment-content')!;
        expect(content.textContent).toBe('Done: Book the dentist is on your list.');
        expect(streamWrites).toBe(2);
    });

    it('is drawn by the streaming renderer in a reasoning block', () => {
        install();
        const el = mount();
        el.addSegment({ id: 'r1', type: 'thinking', content: 'Check the **due', isStreaming: true });

        const content = el.querySelector('[data-segment-id="r1"] .aparte-thinking-content')!;
        expect(content.querySelector('strong')?.textContent).toBe('due');
        expect(content.textContent).not.toContain('**');
    });

    it('leaves a segment flagged finished to the one-shot provider', () => {
        install();
        const el = mount();
        el.addSegment({ id: 's1', type: 'text', content: 'Done: **Book the dentist**', isStreaming: false });

        expect(el.querySelector('[data-segment-id="s1"] .one-shot strong')?.textContent).toBe('Book the dentist');
        expect(streamWrites).toBe(0);
    });

    it('is drawn by the one-shot provider when no streaming one is set', () => {
        aparteGlobalConfig.setMarkdownProvider((md) => `<p class="one-shot">${bold(md)}</p>`);
        const el = mount();
        el.addSegment({ id: 's1', type: 'text', content: 'Done: **Book the dentist** is', isStreaming: true });

        expect(el.querySelector('[data-segment-id="s1"] .one-shot strong')?.textContent).toBe('Book the dentist');
    });
});
