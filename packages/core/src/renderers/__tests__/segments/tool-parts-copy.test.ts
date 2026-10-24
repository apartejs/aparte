/**
 * A tool call's Input and Output can be copied, as a code block can.
 *
 * A developer reading what an agent did copies the command it ran or the result it got;
 * the code segment had a copy button and the tool row's parts — the same kind of text in
 * the same `<pre>` — had none. Each part carries the shared copy button, wired when the
 * row is set up and when a part appears on an update.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getSegmentRenderer, registerDefaultRenderers } from '../../segment-renderers.js';
import type { AparteToolCallSegment } from '../../../types/index.js';

registerDefaultRenderers();
const renderer = () => getSegmentRenderer('tool_call')!;

const call = (over: Partial<AparteToolCallSegment> = {}): AparteToolCallSegment => ({
    id: 's1', type: 'tool_call', messageId: 'm1', index: 0, status: 'resolved',
    toolCall: { id: 'c1', name: 'run_command', input: { command: 'ls -la' } }, result: 'total 0',
    ...over,
} as AparteToolCallSegment);

function mount(segment: AparteToolCallSegment): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = String(renderer().render(segment)).trim();
    const el = host.firstElementChild as HTMLElement;
    document.body.appendChild(host);
    renderer().setup?.(el, segment);
    return el;
}

let restore: (() => void) | undefined;
function clipboard(): ReturnType<typeof vi.fn> {
    const writeText = vi.fn(() => Promise.resolve());
    const original = globalThis.navigator?.clipboard;
    Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText }, configurable: true });
    restore = () => { if (original) Object.defineProperty(globalThis.navigator, 'clipboard', { value: original, configurable: true }); };
    return writeText;
}

afterEach(() => {
    restore?.();
    restore = undefined;
    document.body.innerHTML = '';
});

const copyOf = (el: Element, part: string) => el.querySelector<HTMLButtonElement>(`[data-part="${part}"] .aparte-tool-copy`);

describe('a tool part copies', () => {
    it('each part carries a named copy button', () => {
        const el = mount(call());
        expect(copyOf(el, 'input')?.getAttribute('aria-label')).toBe('Copy');
        expect(copyOf(el, 'output')?.getAttribute('aria-label')).toBe('Copy');
    });

    it('the output button copies the output', () => {
        const writeText = clipboard();
        const el = mount(call());
        copyOf(el, 'output')!.click();
        expect(writeText).toHaveBeenCalledWith('total 0');
    });

    it('a part that appears on an update copies too', () => {
        const writeText = clipboard();
        const el = mount(call({ status: 'pending', result: undefined }));
        expect(copyOf(el, 'output')).toBeNull();
        renderer().update!(el, call());
        copyOf(el, 'output')!.click();
        expect(writeText).toHaveBeenCalledWith('total 0');
    });

    it('copies what the part holds now, not what it held at setup', () => {
        const writeText = clipboard();
        const el = mount(call({ result: 'partial' }));
        renderer().update!(el, call({ result: 'total 0' }));
        copyOf(el, 'output')!.click();
        expect(writeText).toHaveBeenCalledWith('total 0');
    });
});
