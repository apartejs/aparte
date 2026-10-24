// @vitest-environment jsdom
/**
 * A display registered after rows are drawn hides, shows and opens them.
 *
 * `registerToolDisplay` notified the chats, but only `relabel` ran on that — which
 * rewrites words, not elements, and skips a hidden placeholder. So a "hide tool calls"
 * setting turned on over a restored conversation left every row visible, and turning it
 * off left the placeholders hidden. A change to `hidden` or `open` now redraws the
 * messages already on screen; a label change still only relabels them.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat-bubble.js';
import { aparteGlobalConfig } from '../../../config/index.js';
import type { AparteSegment, AparteToolCallSegment } from '../../../types/index.js';

type BubbleEl = HTMLElement & { setSegments(segments: AparteSegment[]): void };

const call: AparteToolCallSegment = {
    id: 'tool-c1', type: 'tool_call', messageId: 'a1', index: 0, status: 'resolved',
    toolCall: { id: 'c1', name: 'web_search', input: { q: 'lille' } }, result: '11°C',
} as AparteToolCallSegment;

function drawn(): BubbleEl {
    const el = document.createElement('aparte-chat-bubble') as BubbleEl;
    el.setAttribute('data-role', 'assistant');
    el.setAttribute('message-id', 'a1');
    document.body.appendChild(el);
    el.setSegments([call]);
    return el;
}

const row = (el: HTMLElement) => el.querySelector<HTMLElement>('[data-segment-id="tool-c1"]')!;
const settle = () => new Promise<void>((resolve) => queueMicrotask(() => queueMicrotask(resolve)));

afterEach(() => {
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

describe('a display registered after the rows are drawn', () => {
    it('hides a row already on screen, and shows it again when unregistered', async () => {
        const el = drawn();
        expect(row(el).hidden).toBe(false);
        aparteGlobalConfig.registerToolDisplay('*', { hidden: true });
        await settle();
        expect(row(el).hidden).toBe(true);
        aparteGlobalConfig.unregisterToolDisplay('*');
        await settle();
        expect(row(el).hidden).toBe(false);
    });

    it('opens a row already on screen', async () => {
        const el = drawn();
        expect((row(el) as HTMLDetailsElement).open).toBe(false);
        aparteGlobalConfig.registerToolDisplay('web_search', { open: true });
        await settle();
        expect((row(el) as HTMLDetailsElement).open).toBe(true);
    });

    it('takes the detail off a row already on screen, and gives it back when unregistered', async () => {
        const el = drawn();
        expect(row(el).querySelector('.aparte-tool-part')).not.toBeNull();
        aparteGlobalConfig.registerToolDisplay('*', { details: false });
        await settle();
        expect(row(el).tagName).toBe('DIV');
        expect(row(el).querySelector('.aparte-tool-part')).toBeNull();
        aparteGlobalConfig.unregisterToolDisplay('*');
        await settle();
        expect(row(el).querySelector('.aparte-tool-part')).not.toBeNull();
    });

    it('draws an app\'s detail on a row already on screen', async () => {
        const el = drawn();
        aparteGlobalConfig.registerToolDisplay('web_search', { details: () => '<p class="said">11 degrees</p>' });
        await settle();
        expect(row(el).querySelector('.said')?.textContent).toBe('11 degrees');
        expect(row(el).querySelector('.aparte-tool-part')).toBeNull();
    });

    it('makes a row already on screen quiet, and loud again when unregistered', async () => {
        const el = drawn();
        aparteGlobalConfig.registerToolDisplay('*', { quiet: true });
        await settle();
        expect(row(el).hasAttribute('data-quiet')).toBe(true);
        expect(row(el).querySelector('.aparte-tool-state')?.classList.contains('aparte-sr-only')).toBe(true);
        aparteGlobalConfig.unregisterToolDisplay('*');
        await settle();
        expect(row(el).hasAttribute('data-quiet')).toBe(false);
    });

    it('a label change only relabels: the element the reader opened stays', async () => {
        const el = drawn();
        const before = row(el) as HTMLDetailsElement;
        before.open = true;
        aparteGlobalConfig.registerToolDisplay('web_search', { label: 'Web search' });
        await settle();
        expect(row(el)).toBe(before);
        expect(before.open).toBe(true);
        expect(before.querySelector('.aparte-tool-name')?.textContent).toBe('Web search');
    });
});
