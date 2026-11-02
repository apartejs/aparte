// @vitest-environment jsdom
/**
 * A stream driven by hand ends with its whole text.
 *
 * `appendToSegment` on a segment with no `isStreaming` flag draws through the incremental
 * Markdown parser, which holds back what may still open a token — the full stop after
 * `**the whole wiring**` — until it is told the text is complete. The docs' own streaming
 * demo ends its stream by removing the bubble's `streaming` attribute, and nothing told the
 * segment: the reply ended "That is the whole wiring", its full stop never drawn, and the
 * settle pass that re-sanitises what the parser wrote never ran.
 *
 * The provider is a stand-in for `@aparte/plugin-streaming-markdown` (core cannot import a
 * plugin): it holds back a trailing run of `*`, `_` or `.` until `end()`, as a parser that
 * waits to know whether a token opens does. Core also opens and ends it for its own probes,
 * so the assertions look for this text's end, not for a count of every `end()`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat-bubble.js';
import { aparteGlobalConfig } from '../../../config/index.js';

function installHoldingBackProvider(): { ended: string[] } {
    const ended: string[] = [];
    aparteGlobalConfig.setStreamingMarkdownProvider((target: HTMLElement) => {
        let buffer = '';
        const draw = (text: string): void => { target.textContent = text; };
        return {
            write: (chunk: string): void => {
                buffer += chunk;
                draw(buffer.replace(/[*_.]+$/, ''));
            },
            end: (): void => { ended.push(buffer); draw(buffer); },
        };
    });
    return { ended };
}

function mount(): HTMLElementTagNameMap['aparte-chat-bubble'] {
    const el = document.createElement('aparte-chat-bubble');
    el.setAttribute('message-id', 'm1');
    el.setAttribute('data-role', 'assistant');
    el.setAttribute('streaming', '');
    document.body.appendChild(el);
    return el;
}

const text = (el: HTMLElement): string => el.querySelector('.aparte-segment-content')?.textContent ?? '';

afterEach(() => {
    document.body.innerHTML = '';
    aparteGlobalConfig.reset();
});

describe('a stream driven by hand', () => {
    it('draws its held-back tail once the bubble stops streaming', () => {
        const { ended } = installHoldingBackProvider();
        const bubble = mount();
        bubble.setSegments([{ id: 's1', type: 'text', content: '' }]);
        for (const chunk of ['That is ', 'the whole ', 'wiring.']) bubble.appendToSegment('s1', chunk);
        expect(text(bubble), 'held back while it streams').toBe('That is the whole wiring');

        bubble.removeAttribute('streaming');

        expect(ended, 'the parser was told the text is complete').toContain('That is the whole wiring.');
        expect(text(bubble)).toBe('That is the whole wiring.');
    });

    it('leaves alone a segment its writer already settled', () => {
        const { ended } = installHoldingBackProvider();
        const bubble = mount();
        bubble.setSegments([{ id: 's1', type: 'text', content: '' }]);
        bubble.appendToSegment('s1', 'Done.');
        bubble.updateSegment('s1', { isStreaming: false });
        expect(ended.filter((t) => t === 'Done.')).toHaveLength(1);

        bubble.removeAttribute('streaming');

        expect(ended.filter((t) => t === 'Done.'), 'no second settle').toHaveLength(1);
        expect(text(bubble)).toBe('Done.');
    });

    it('settles nothing it never wrote to', () => {
        const { ended } = installHoldingBackProvider();
        const bubble = mount();
        bubble.setSegments([{ id: 's1', type: 'text', content: 'Set at once.' }]);
        // Drawing a finished text renders it through the provider once, whole.
        const before = ended.length;

        bubble.removeAttribute('streaming');

        expect(ended.length, 'the stop rewrote nothing').toBe(before);
        expect(text(bubble)).toBe('Set at once.');
    });
});
