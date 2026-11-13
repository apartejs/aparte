/**
 * A `<summary>` is the disclosure's button: what it holds is its name, and a control nested in
 * it is not a control of its own (interactive content inside an element whose role is button —
 * the Open button's label merged into the summary's name, and the button lost to a screen
 * reader). So a row with a disclosure keeps the Open button OUTSIDE its summary, beside it on the
 * row's first line: the button opens, the summary toggles, and neither does the other's job.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getSegmentRenderer, registerDefaultRenderers } from '../../segment-renderers.js';
import { aparteGlobalConfig } from '../../../config/index.js';
import type { AparteToolCallSegment, AparteToolLine } from '../../../types/index.js';

registerDefaultRenderers();
const renderer = () => getSegmentRenderer('tool_call')!;

const call = (over: Partial<AparteToolCallSegment> = {}): AparteToolCallSegment => ({
    id: 's1', type: 'tool_call', messageId: 'm1', index: 0, status: 'pending',
    toolCall: { id: 'c1', name: 'delegate', input: { task: 'Read the changelog' } },
    ...over,
} as AparteToolCallSegment);

function draw(segment: AparteToolCallSegment): HTMLElement {
    const out = renderer().render(segment);
    const tpl = document.createElement('template');
    if (typeof out === 'string') tpl.innerHTML = out.trim();
    const el = (typeof out === 'string' ? tpl.content.firstElementChild : out) as HTMLElement;
    document.body.appendChild(el);
    renderer().setup?.(el, segment);
    return el;
}

const INTERACTIVE = 'button, a[href], input, select, textarea, [tabindex], [role="button"]';

afterEach(() => {
    aparteGlobalConfig.reset();
    registerDefaultRenderers();
    document.body.innerHTML = '';
});

describe('the Open button is never inside a summary', () => {
    for (const [kind, details] of [['the app’s detail', () => 'Its work'], ['core’s input and output', undefined]] as const) {
        describe(`a row with ${kind}`, () => {
            const line = (onOpen: () => void): AparteToolLine => ({ label: 'Explorer', ...(details ? { details } : {}), open: { label: 'Open Explorer', onOpen } });

            it('has no interactive element inside its summary, and its button on the row', () => {
                aparteGlobalConfig.setToolLineProvider(() => line(() => {}));
                const row = draw(call());
                const summary = row.querySelector('summary')!;
                expect(summary).not.toBeNull();
                expect(summary.querySelector(INTERACTIVE)).toBeNull();
                const open = row.querySelector<HTMLButtonElement>('.aparte-tool-open')!;
                expect(open.closest('summary')).toBeNull();
                expect(open.closest('.aparte-segment-tool-call')).toBe(row);
                expect(open.getAttribute('aria-label')).toBe('Open Explorer');
                // Seen when the disclosure is closed: not in its content either.
                expect(open.closest('details')).toBeNull();
                expect(row.hasAttribute('data-opens')).toBe(true);
            });

            it('opens on the button — click, Enter or Space — and the detail stays as it was', () => {
                const onOpen = vi.fn();
                aparteGlobalConfig.setToolLineProvider(() => line(onOpen));
                const row = draw(call());
                const disclosure = row.querySelector('details')!;
                const open = row.querySelector<HTMLButtonElement>('.aparte-tool-open')!;
                const click = new MouseEvent('click', { bubbles: true, cancelable: true });
                open.dispatchEvent(click);
                expect(onOpen).toHaveBeenCalledTimes(1);
                expect(onOpen).toHaveBeenCalledWith(row);
                // Nothing to cancel: the button is not the summary's.
                expect(click.defaultPrevented).toBe(false);
                expect(disclosure.open).toBe(false);
                // A native button turns Enter and Space into a click; that click is what opens.
                expect(open.tagName).toBe('BUTTON');
                expect(open.type).toBe('button');
            });

            it('toggles the detail by its summary, and the summary opens nothing', () => {
                const onOpen = vi.fn();
                aparteGlobalConfig.setToolLineProvider(() => line(onOpen));
                const row = draw(call());
                const disclosure = row.querySelector('details')!;
                row.querySelector<HTMLElement>('summary')!.click();
                expect(disclosure.open).toBe(true);
                row.querySelector<HTMLElement>('.aparte-tool-name')!.click();
                expect(disclosure.open).toBe(false);
                expect(onOpen).not.toHaveBeenCalled();
            });

            it('keeps its shape, its button and what the reader opened on update', () => {
                aparteGlobalConfig.setToolLineProvider(() => line(() => {}));
                const row = draw(call());
                row.querySelector('details')!.open = true;
                renderer().update!(row, call({ status: 'resolved', result: 'done' }));
                const now = document.querySelector<HTMLElement>('[data-segment-id="s1"]')!;
                expect(now).toBe(row);
                expect(now.querySelector('details')!.open).toBe(true);
                expect(now.querySelector('summary')!.querySelector(INTERACTIVE)).toBeNull();
                expect(now.querySelectorAll('.aparte-tool-open')).toHaveLength(1);
            });
        });
    }

    it('loses the button on update when the provider stops offering it, and keeps the detail open', () => {
        let offered = true;
        aparteGlobalConfig.setToolLineProvider((): AparteToolLine => ({ details: () => 'Its work', ...(offered ? { open: { label: 'Open', onOpen: () => {} } } : {}) }));
        const row = draw(call());
        row.querySelector('details')!.open = true;
        offered = false;
        renderer().update!(row, call());
        const now = document.querySelector<HTMLElement>('[data-segment-id="s1"]')!;
        expect(now.querySelector('.aparte-tool-open')).toBeNull();
        expect(now.hasAttribute('data-opens')).toBe(false);
        // Back to the row it is without `open`: the `<details>` itself, still open.
        expect(now.tagName).toBe('DETAILS');
        expect((now as HTMLDetailsElement).open).toBe(true);
    });
});
