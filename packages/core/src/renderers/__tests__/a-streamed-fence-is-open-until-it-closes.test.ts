// @vitest-environment jsdom
/**
 * A fence is open while it streams, and the code pane behaves accordingly.
 *
 * The parser never marked an open fence `isStreaming: true` (only registered blocks
 * were), and the code renderer tested the flag for truthiness — so `undefined` read as
 * finished, the full async highlight ran on every token, and the streaming path built
 * for this case never ran. Fixing the flag made the two highlight paths able to race:
 * a streaming highlight still in flight could land after the settled one and put a
 * partial pane back. And the copy button read the pane's text, which stops being the
 * source as soon as something other than a highlighter draws into it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AparteStreamParser } from '../../parsers/aparte-stream-parser.js';
import { codeRenderer } from '../segments/code.js';
import { aparteGlobalConfig } from '../../config/index.js';
import type { AparteCodeSegment } from '../../types/index.js';

const settle = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

function mount(segment: AparteCodeSegment): HTMLElement {
    const holder = document.createElement('div');
    holder.innerHTML = codeRenderer.render(segment) as string;
    const element = holder.firstElementChild as HTMLElement;
    document.body.appendChild(element);
    codeRenderer.setup?.(element, segment);
    return element;
}

const pane = (el: HTMLElement) => el.querySelector('.aparte-code-content-wrapper')!;

afterEach(() => {
    vi.useRealTimers();
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

describe('the parser marks an open fence as streaming', () => {
    it('is open from its first line, and closed by its closing fence', () => {
        const parser = new AparteStreamParser();
        parser.parse('```ts\nconst a');
        expect(parser.getState().activeSegment).toMatchObject({ type: 'code', isStreaming: true });

        const closed = parser.parse(' = 1;\n```\n').segments.find((s) => s.type === 'code');
        expect(closed).toMatchObject({ content: 'const a = 1;', isStreaming: false });
    });

    it('is closed when the reply ends inside it', () => {
        const parser = new AparteStreamParser();
        parser.parse('```ts\nconst a = 1;\n');
        const [code] = parser.finalize();
        expect(code).toMatchObject({ type: 'code', isStreaming: false });
    });
});

describe('the code pane', () => {
    let calls: string[];
    beforeEach(() => {
        calls = [];
        aparteGlobalConfig.setHighlightProvider((code) => {
            calls.push(code);
            return `<pre><code><span class="tok">${code}</span></code></pre>`;
        });
    });

    it('does not run the whole-content highlight while the fence streams', async () => {
        vi.useFakeTimers();
        const segment: AparteCodeSegment = { id: 'c1', type: 'code', language: 'ts', content: '', isStreaming: true };
        const el = mount(segment);
        codeRenderer.update?.(el, { ...segment, content: 'const a' });
        codeRenderer.update?.(el, { ...segment, content: 'const a = 1' });
        await settle();
        // Only whole lines go to the provider while it streams, and there are none yet.
        expect(calls).toEqual([]);

        codeRenderer.update?.(el, { ...segment, content: 'const a = 1;', isStreaming: false });
        await settle();
        expect(calls).toEqual(['const a = 1;']);
        expect(pane(el).querySelector('.tok')!.textContent).toBe('const a = 1;');
    });

    it('keeps the settled highlight when a streaming one lands after it', async () => {
        const resolvers: Array<(html: string) => void> = [];
        aparteGlobalConfig.setHighlightProvider((code) => new Promise<string>((res) => {
            calls.push(code);
            resolvers.push(res);
        }));
        const segment: AparteCodeSegment = { id: 'c2', type: 'code', language: 'ts', content: '', isStreaming: true };
        const el = mount(segment);
        codeRenderer.update?.(el, { ...segment, content: 'a\nb' });               // streaming highlight of 'a\n'
        codeRenderer.update?.(el, { ...segment, content: 'a\nb\n', isStreaming: false }); // settle highlight
        expect(calls).toEqual(['a\n', 'a\nb\n']);

        resolvers[1]!('<pre><code><span class="tok">a\nb\n</span></code></pre>');
        await settle();
        resolvers[0]!('<pre><code><span class="tok">a\n</span></code></pre>');
        await settle();
        expect(pane(el).querySelector('.tok')!.textContent).toBe('a\nb\n');
        expect(pane(el).querySelector('[data-aparte-tail]')).toBeNull();
    });

    it('keeps the newest settled highlight when two resolve out of order', async () => {
        const resolvers: Array<(html: string) => void> = [];
        aparteGlobalConfig.setHighlightProvider((code) => new Promise<string>((res) => {
            calls.push(code);
            resolvers.push(res);
        }));
        const segment: AparteCodeSegment = { id: 'c3', type: 'code', language: 'ts', content: 'old', isStreaming: false };
        const el = mount(segment);
        codeRenderer.update?.(el, { ...segment, content: 'new' });

        resolvers[1]!('<pre><code><span class="tok">new</span></code></pre>');
        await settle();
        resolvers[0]!('<pre><code><span class="tok">old</span></code></pre>');
        await settle();
        expect(pane(el).querySelector('.tok')!.textContent).toBe('new');
    });

    it('copies the source, whatever the pane now shows', async () => {
        const writeText = vi.fn(() => Promise.resolve());
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        const segment: AparteCodeSegment = { id: 'c4', type: 'code', language: 'mermaid', content: 'flowchart TD\n  A --> B', isStreaming: false };
        const el = mount(segment);
        await settle();
        pane(el).innerHTML = '<img alt="Diagram">';

        el.querySelector<HTMLElement>('.aparte-code-copy')!.click();
        expect(writeText).toHaveBeenCalledWith('flowchart TD\n  A --> B');
    });
});
