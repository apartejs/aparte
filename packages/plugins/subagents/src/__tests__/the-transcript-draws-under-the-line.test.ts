/**
 * The transcript draws under the line.
 *
 * With `details: 'transcript'`, a sub-agent's line opens on its conversation: the task it
 * was given, then its text and its tool rows, drawn by core's own renderers. While it
 * works, the SAME element is completed in place — a token costs the one row it lands in,
 * never a rewrite of the whole conversation. The app's own display for the tool still wins.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import { setupSubagents, subagentTranscript, type SubagentsOptions } from '../index.js';
import { as, chat, frame, shown } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

async function working(options: SubagentsOptions = { details: 'transcript' }) {
    stop = setupSubagents(options);
    const c = chat();
    c.run(
        { type: 'run-start' },
        { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
        { type: 'agent-start', agentId: 'a1', name: 'Researcher', description: 'Read the parser', toolCallId: 'c1' },
        ...as('a1',
            { type: 'turn-start' },
            { type: 'text-delta', delta: 'Reading the parser.' },
            { type: 'tool-start', toolCallId: 'r1', name: 'read_file', input: { path: 'parser.ts' } },
            { type: 'tool-resolved', toolCallId: 'r1', result: 'export function parse() {}' },
            { type: 'turn-start' },
            { type: 'text-delta', delta: 'It splits' },
        ),
    );
    await frame();
    return c;
}

const viewIn = (row: Element | null): HTMLElement | null =>
    row?.querySelector<HTMLElement>(':scope > .aparte-tool-detail > aparte-subagent-view') ?? null;

const rowsOf = (view: HTMLElement | null): HTMLElement[] =>
    [...(view?.querySelector('.aparte-subagent-transcript')?.children ?? [])] as HTMLElement[];

describe('the transcript under the line', () => {
    it("opens on the sub-agent's task, its text and its tool rows, closed by default", async () => {
        const c = await working();
        const row = c.row('tool-c1')!;
        expect(row.tagName).toBe('DETAILS');
        expect((row as HTMLDetailsElement).open).toBe(false);
        expect(shown(row, 'name')).toBe('Researcher');

        const view = viewIn(row)!;
        expect(view).not.toBeNull();
        expect(view.hasAttribute('data-inline')).toBe(true);
        expect(view.querySelector('.aparte-subagent-task')!.textContent).toBe('Read the parser');
        const rows = rowsOf(view);
        expect(rows.map((r) => r.getAttribute('data-segment-id'))).toContain('tool-r1');
        const call = rows.find((r) => r.getAttribute('data-segment-id') === 'tool-r1')!;
        expect(call.classList.contains('aparte-segment-tool-call')).toBe(true);
        expect(call.getAttribute('data-status')).toBe('resolved');
        expect(shown(call, 'name')).toBe('read_file');
        expect(view.textContent).toContain('Reading the parser.');
        expect(view.textContent).toContain('It splits');
        // Nothing of the child in the reply's own rows.
        expect(c.segments().map((s) => s.id)).toEqual(['tool-c1']);
    });

    it('is completed in place while the sub-agent works, row by row', async () => {
        const c = await working();
        const view = viewIn(c.row('tool-c1'))!;
        const before = rowsOf(view);
        const growing = before.at(-1)!;

        const outer = vi.spyOn(Element.prototype, 'outerHTML', 'get');
        const replace = vi.spyOn(Element.prototype, 'replaceChildren');
        const inner = vi.spyOn(Element.prototype, 'innerHTML', 'set');
        for (const word of [' the input', ' into', ' tokens.']) {
            c.run(...as('a1', { type: 'text-delta', delta: word }));
            await frame();
        }

        expect(viewIn(c.row('tool-c1'))).toBe(view);
        const after = rowsOf(view);
        // The rows already there are the same nodes, and the last one grew.
        expect(after.slice(0, before.length)).toEqual(before);
        expect(growing.textContent).toContain('It splits the input into tokens.');
        // The conversation is never serialised, emptied or rewritten as a whole.
        const transcript = view.querySelector('.aparte-subagent-transcript')!;
        const touched = (spy: { mock: { contexts: unknown[] } }) =>
            spy.mock.contexts.filter((el) => el === view || el === transcript || el === c.row('tool-c1'));
        expect(touched(outer)).toEqual([]);
        expect(touched(replace)).toEqual([]);
        expect(touched(inner)).toEqual([]);
    });

    it('takes a new call of the sub-agent as a new row, and keeps what the reader opened', async () => {
        const c = await working();
        const row = c.row('tool-c1') as HTMLDetailsElement;
        row.open = true;
        const view = viewIn(row)!;
        const first = rowsOf(view).find((r) => r.getAttribute('data-segment-id') === 'tool-r1')!;
        c.run(...as('a1', { type: 'tool-start', toolCallId: 'r2', name: 'grep', input: { q: 'parse(' } }));
        expect(c.row('tool-c1')).toBe(row);
        expect(row.open).toBe(true);
        const ids = rowsOf(view).map((r) => r.getAttribute('data-segment-id'));
        expect(ids.slice(-1)).toEqual(['tool-r2']);
        expect(rowsOf(view).find((r) => r.getAttribute('data-segment-id') === 'tool-r1')).toBe(first);
    });

    it('settles when the sub-agent ends: its text is finished, nothing reads as arriving', async () => {
        const c = await working();
        c.run(
            { type: 'agent-end', agentId: 'a1', status: 'done', result: 'ok' },
            { type: 'tool-resolved', toolCallId: 'c1', result: 'ok' },
        );
        const view = viewIn(c.row('tool-c1'))!;
        expect(view.textContent).toContain('It splits');
        expect(view.querySelector('.aparte-shimmer')).toBeNull();
    });

    it("the app's display for the tool wins: no detail, or the detail opened", async () => {
        aparteGlobalConfig.registerToolDisplay('delegate', { details: false });
        const closed = await working();
        expect(closed.row('tool-c1')!.tagName).toBe('DIV');
        expect(viewIn(closed.row('tool-c1'))).toBeNull();

        document.body.innerHTML = '';
        stop?.();
        aparteGlobalConfig.reset();
        aparteGlobalConfig.registerToolDisplay('delegate', { open: true });
        const opened = await working();
        expect((opened.row('tool-c1') as HTMLDetailsElement).open).toBe(true);
        expect(viewIn(opened.row('tool-c1'))).not.toBeNull();
    });

    it('can be registered by the app for one tool, without the option', async () => {
        aparteGlobalConfig.registerToolDisplay('delegate', { details: subagentTranscript });
        const c = await working({});
        expect(viewIn(c.row('tool-c1'))!.textContent).toContain('Reading the parser.');
    });

    it('has nothing behind the line before the sub-agent has anything to show', () => {
        stop = setupSubagents({ details: 'transcript' });
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Quiet', toolCallId: 'c1' },
        );
        expect(c.row('tool-c1')!.tagName).toBe('DIV');
        expect(subagentTranscript({ id: 'x', type: 'tool_call', status: 'pending', toolCall: { id: 'x', name: 'n', input: {} } } as never)).toBe('');
    });

    it("draws a sub-agent no call opened under its own segment's line", async () => {
        stop = setupSubagents({ details: 'transcript' });
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'agent-start', agentId: 'p1', name: 'Planner', description: 'Plan the fix' },
            ...as('p1', { type: 'turn-start' }, { type: 'text-delta', delta: 'Step one.' }),
        );
        await frame();
        const row = c.row('subagent-p1')!;
        expect(row.tagName).toBe('DETAILS');
        const view = viewIn(row)!;
        expect(view.querySelector('.aparte-subagent-task')!.textContent).toBe('Plan the fix');
        expect(view.textContent).toContain('Step one.');
    });
});
