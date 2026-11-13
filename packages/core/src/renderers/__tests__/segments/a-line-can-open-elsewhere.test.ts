/**
 * A tool line can open what it stands for elsewhere (`AparteToolLine.open`).
 *
 * A plugin that knows a call from the inside — a sub-agent's — can say that the call can be
 * shown somewhere else: a pane beside the chat. Core then draws a real button at the end of
 * the line, named by the provider, and calls back when it is pressed. A row with nothing
 * behind it opens on a click anywhere on its line; a row with a disclosure keeps its line for
 * the disclosure, and only the button opens. Without `open`, the line is exactly as before.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getSegmentRenderer, registerDefaultRenderers } from '../../segment-renderers.js';
import { aparteGlobalConfig } from '../../../config/index.js';
import type { AparteToolCallSegment, AparteToolLine } from '../../../types/index.js';

registerDefaultRenderers();
const renderer = () => getSegmentRenderer('tool_call')!;

const call = (over: Partial<AparteToolCallSegment> = {}): AparteToolCallSegment => ({
    id: 's1', type: 'tool_call', messageId: 'm1', index: 0, status: 'pending',
    toolCall: { id: 'c1', name: 'delegate', input: {} },
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

const button = (row: Element): HTMLButtonElement | null =>
    row.querySelector<HTMLButtonElement>(':scope > :is(.aparte-tool-line, .aparte-tool-summary) > .aparte-tool-open');

afterEach(() => {
    aparteGlobalConfig.reset();
    registerDefaultRenderers();
    document.body.innerHTML = '';
});

describe('a line that opens elsewhere', () => {
    it('is exactly the line it was without `open`: no button, no mark', () => {
        aparteGlobalConfig.setToolLineProvider(() => ({ label: 'Explorer' }));
        const row = draw(call());
        expect(button(row)).toBeNull();
        expect(row.hasAttribute('data-opens')).toBe(false);
        expect(row.querySelector('[role], [tabindex]')).toBeNull();
    });

    it('draws a named button at the end of the line, which calls back with the row', () => {
        const onOpen = vi.fn();
        aparteGlobalConfig.setToolLineProvider((): AparteToolLine => ({ label: 'Explorer', details: false, open: { label: 'Open Explorer', onOpen } }));
        const row = draw(call());
        const open = button(row)!;
        expect(open).not.toBeNull();
        expect(open.tagName).toBe('BUTTON');
        expect(open.type).toBe('button');
        expect(open.classList.contains('aparte-btn')).toBe(true);
        expect(open.getAttribute('aria-label')).toBe('Open Explorer');
        expect(open.title).toBe('Open Explorer');
        expect(open.querySelector('svg')).not.toBeNull();
        expect(row.hasAttribute('data-opens')).toBe(true);

        open.click();
        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onOpen).toHaveBeenCalledWith(row);
    });

    it('opens on a click anywhere on a line with nothing behind it', () => {
        const onOpen = vi.fn();
        aparteGlobalConfig.setToolLineProvider((): AparteToolLine => ({ label: 'Explorer', details: false, open: { label: 'Open', onOpen } }));
        const row = draw(call());
        expect(row.tagName).toBe('DIV');
        row.querySelector<HTMLElement>('.aparte-tool-name')!.click();
        expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it('keeps the line of a row with a disclosure for the disclosure: only the button opens, and it does not toggle', () => {
        const onOpen = vi.fn();
        aparteGlobalConfig.setToolLineProvider((): AparteToolLine => ({ label: 'Explorer', details: () => 'Its work', open: { label: 'Open', onOpen } }));
        const row = draw(call()) as HTMLDetailsElement;
        expect(row.tagName).toBe('DETAILS');
        expect(button(row)!.parentElement!.tagName).toBe('SUMMARY');

        row.querySelector<HTMLElement>('.aparte-tool-name')!.click();
        expect(onOpen).not.toHaveBeenCalled();

        const click = new MouseEvent('click', { bubbles: true, cancelable: true });
        button(row)!.dispatchEvent(click);
        expect(onOpen).toHaveBeenCalledTimes(1);
        // The summary's toggle is the click's default action: cancelled, so the detail stays as it was.
        expect(click.defaultPrevented).toBe(true);
    });

    it('marks the row whose subject is open, and follows the provider on update and relabel', () => {
        let current = false;
        aparteGlobalConfig.setToolLineProvider((): AparteToolLine => ({ details: false, open: { label: current ? 'Shown' : 'Open', current, onOpen: () => {} } }));
        let row = draw(call());
        expect(row.hasAttribute('data-current')).toBe(false);
        expect(button(row)!.hasAttribute('aria-current')).toBe(false);

        current = true;
        renderer().update!(row, call({ status: 'resolved' }));
        row = document.querySelector<HTMLElement>('[data-segment-id="s1"]')!;
        expect(row.hasAttribute('data-current')).toBe(true);
        expect(button(row)!.getAttribute('aria-current')).toBe('true');
        expect(button(row)!.getAttribute('aria-label')).toBe('Shown');

        current = false;
        renderer().relabel!(row, call({ status: 'resolved' }));
        expect(row.hasAttribute('data-current')).toBe(false);
        expect(button(row)!.hasAttribute('aria-current')).toBe(false);
        expect(button(row)!.getAttribute('aria-label')).toBe('Open');
    });

    it('calls the latest provider answer, and gains or loses the button on update', () => {
        const first = vi.fn();
        const second = vi.fn();
        let line: AparteToolLine = { details: false };
        aparteGlobalConfig.setToolLineProvider(() => line);
        let row = draw(call());
        expect(button(row)).toBeNull();

        line = { details: false, open: { label: 'Open', onOpen: first } };
        renderer().update!(row, call());
        row = document.querySelector<HTMLElement>('[data-segment-id="s1"]')!;
        expect(button(row)).not.toBeNull();

        line = { details: false, open: { label: 'Open', onOpen: second } };
        renderer().update!(row, call());
        button(row)!.click();
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);

        line = { details: false };
        renderer().update!(row, call());
        expect(button(row)).toBeNull();
        expect(row.hasAttribute('data-opens')).toBe(false);
        row.querySelector<HTMLElement>('.aparte-tool-name')!.click();
        expect(second).toHaveBeenCalledTimes(1);
    });

    it('leaves a nested row its own button: a click on it opens that row alone', () => {
        const outer = vi.fn();
        const inner = vi.fn();
        aparteGlobalConfig.setToolLineProvider((segment): AparteToolLine => ({ details: false, open: { label: 'Open', onOpen: segment.id === 's1' ? outer : inner } }));
        const row = draw(call());
        const nestedSegment = call({ id: 's2', toolCall: { id: 'c2', name: 'delegate', input: {} } });
        const nested = draw(nestedSegment);
        row.append(nested);
        button(nested)!.click();
        expect(inner).toHaveBeenCalledTimes(1);
        expect(outer).not.toHaveBeenCalled();
    });
});
