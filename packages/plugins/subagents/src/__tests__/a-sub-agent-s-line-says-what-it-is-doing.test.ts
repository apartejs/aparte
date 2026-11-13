/**
 * A sub-agent's line says what it is doing.
 *
 * Its name and its task on the first line; on the second, from its start to its end, what it is
 * on — "Starting…", then its latest call as that call's own row names it — and once it is over,
 * what it did: "N tools · duration". The second line is there the whole time, so the row keeps
 * its height: one that grew a line when the sub-agent began acting and lost it when it ended
 * moved every row under it twice. Each field is read through the tool-line provider, after the
 * app's own display, which wins field by field. The options take the live action and the counts
 * off. A language switch reads the words again: nothing is stored on the segment as text.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { aparteGlobalConfig, type AparteToolCallSegment } from '@aparte/core';
import { setupSubagents } from '../index.js';
import { as, chat, frame, shown } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    document.body.innerHTML = '';
    stop?.();
    vi.restoreAllMocks();
    aparteGlobalConfig.reset();
});

/** A sub-agent at work: one call done, one running, started at t=1000, now t=13000. */
function working() {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    aparteGlobalConfig.registerToolDisplay('read_file', {
        label: 'Read',
        summary: (s: AparteToolCallSegment) => String(s.toolCall.input['path']),
    });
    const c = chat();
    c.run(
        { type: 'run-start' },
        { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
        { type: 'agent-start', agentId: 'a1', name: 'Researcher', description: 'Find the callers', toolCallId: 'c1' },
        ...as('a1',
            { type: 'turn-start' },
            { type: 'tool-start', toolCallId: 'g1', name: 'grep', input: { q: 'parse(' } },
            { type: 'tool-resolved', toolCallId: 'g1', result: '3 hits' },
        ),
    );
    now.mockReturnValue(13_000);
    c.run(...as('a1', { type: 'tool-start', toolCallId: 'r1', name: 'read_file', input: { path: 'parser.ts' } }));
    return { c, now };
}

/** The same sub-agent once it is over: its last call finished at t=13000, the end came at t=20000. */
function finished() {
    const { c, now } = working();
    c.run(...as('a1', { type: 'tool-resolved', toolCallId: 'r1', result: 'x' }, { type: 'text-delta', delta: 'Found them.' }, { type: 'text-flush' }));
    now.mockReturnValue(20_000);
    c.run(
        { type: 'agent-end', agentId: 'a1', status: 'done', result: 'Found them.' },
        { type: 'tool-resolved', toolCallId: 'c1', result: 'Found them.' },
    );
    return { c, now };
}

describe("a sub-agent's line", () => {
    it('says its name, its task and its last action while it works', () => {
        stop = setupSubagents();
        const { c } = working();
        const row = c.row('tool-c1');
        expect(shown(row, 'name')).toBe('Researcher');
        expect(shown(row, 'target')).toBe('Find the callers');
        // The running call, as its own row names it: the app's label and summary.
        expect(shown(row, 'activity')).toBe('Read parser.ts');
        // No count while it works: a note that grew with each call moved the task beside it.
        expect(shown(row, 'note')).toBeNull();
        // No disclosure: the line alone.
        expect(row!.tagName).not.toBe('DETAILS');
    });

    it('keeps its second line from its start to its end', () => {
        stop = setupSubagents();
        const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Researcher', toolCallId: 'c1' },
        );
        expect(shown(c.row('tool-c1'), 'activity'), 'before its first call').toBe('Starting…');
        c.run(...as('a1', { type: 'turn-start' }, { type: 'tool-start', toolCallId: 'g1', name: 'grep', input: {} }));
        expect(shown(c.row('tool-c1'), 'activity'), 'at its first call').toBe('grep');
        now.mockReturnValue(4_000);
        c.run(
            ...as('a1', { type: 'tool-resolved', toolCallId: 'g1', result: 'none' }),
            { type: 'agent-end', agentId: 'a1', status: 'done', result: 'Nothing.' },
            { type: 'tool-resolved', toolCallId: 'c1', result: 'Nothing.' },
        );
        expect(shown(c.row('tool-c1'), 'activity'), 'once it is over').toBe('1 tool · 3s');
    });

    it('falls back to the call\'s identifier when the sub-agent has no name of its own', () => {
        stop = setupSubagents();
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', toolCallId: 'c1' },
        );
        expect(shown(c.row('tool-c1'), 'name')).toBe('delegate');
    });

    // Only a call open at that instant used to count, and with fast tools the line never said
    // anything: the call was over before the next draw. While the sub-agent works, its latest
    // call is the step it is on — it is reading that result, or writing about it.
    it('keeps naming its latest call once that call has finished, while it still works', () => {
        stop = setupSubagents();
        const { c } = working();
        c.run(...as('a1', { type: 'tool-resolved', toolCallId: 'r1', result: 'x' }, { type: 'text-delta', delta: 'Reading it' }));
        expect(shown(c.row('tool-c1'), 'activity')).toBe('Read parser.ts');
    });

    it('names the call running now over a later one that finished', () => {
        stop = setupSubagents();
        const { c } = working();
        // r1 still runs; a later call starts and finishes beside it.
        c.run(...as('a1',
            { type: 'tool-start', toolCallId: 'g2', name: 'grep', input: { q: 'x' } },
            { type: 'tool-resolved', toolCallId: 'g2', result: 'none' },
        ));
        expect(shown(c.row('tool-c1'), 'activity')).toBe('Read parser.ts');
    });

    it('says it is starting before its first call', () => {
        stop = setupSubagents();
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Researcher', toolCallId: 'c1' },
            ...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'Thinking it over' }),
        );
        expect(shown(c.row('tool-c1'), 'activity')).toBe('Starting…');
    });

    it('says what it did once it is done: the count and the duration, on its second line', async () => {
        stop = setupSubagents();
        const { c } = finished();
        const row = c.row('tool-c1');
        // From its start to the last moment its conversation moved — not to "now".
        expect(shown(row, 'activity')).toBe('2 tools · 12s');
        expect(shown(row, 'note')).toBeNull();
        await frame();
        expect(shown(c.row('tool-c1'), 'activity')).toBe('2 tools · 12s');
    });

    it("the app's display wins, field by field", () => {
        stop = setupSubagents();
        aparteGlobalConfig.registerToolDisplay('delegate', { label: 'Delegated', summary: () => 'to a helper' });
        const { c } = working();
        const row = c.row('tool-c1');
        expect(shown(row, 'name')).toBe('Delegated');
        expect(shown(row, 'target')).toBe('to a helper');
        // What no display can know is still the plugin's.
        expect(shown(row, 'activity')).toBe('Read parser.ts');
    });

    it("the app's details win over the line alone", () => {
        stop = setupSubagents();
        aparteGlobalConfig.registerToolDisplay('delegate', { details: () => 'Behind the line' });
        const { c } = working();
        const row = c.row('tool-c1')!;
        expect(row.tagName).toBe('DETAILS');
        expect(row.querySelector('.aparte-tool-detail')!.textContent).toContain('Behind the line');
    });

    it('a details function given to the plugin is what is behind the line', () => {
        stop = setupSubagents({ details: (segment) => `Lane of ${segment.toolCall.name}` });
        const { c } = working();
        const row = c.row('tool-c1')!;
        expect(row.tagName).toBe('DETAILS');
        expect(row.querySelector('.aparte-tool-detail')!.textContent).toContain('Lane of delegate');
    });

    it("'transcript' puts the sub-agent's conversation behind the line", () => {
        stop = setupSubagents({ details: 'transcript' });
        const { c } = working();
        const row = c.row('tool-c1')!;
        expect(row.tagName).toBe('DETAILS');
        expect(row.querySelector('.aparte-tool-detail > aparte-subagent-view')!.textContent).toContain('Find the callers');
    });

    it('a label that throws costs the running call its label, not the line', () => {
        stop = setupSubagents();
        aparteGlobalConfig.registerToolDisplay('grep', { label: () => { throw new Error('bad label'); } });
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Researcher', toolCallId: 'c1' },
            ...as('a1', { type: 'turn-start' }, { type: 'tool-start', toolCallId: 'g1', name: 'grep', input: {} }),
        );
        expect(shown(c.row('tool-c1'), 'activity')).toBe('grep');
    });

    it('says the state where the call that opened it says another', () => {
        stop = setupSubagents();
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Researcher', toolCallId: 'c1' },
            { type: 'agent-end', agentId: 'a1', status: 'failed', error: 'model refused' },
            // The tool caught the failure and answered: the CALL is done, the sub-agent failed.
            { type: 'tool-resolved', toolCallId: 'c1', result: 'It could not.' },
        );
        expect(shown(c.row('tool-c1'), 'note')).toMatch(/^Failed/);
    });

    it('activity: false and counts: false leave the line alone, one line', () => {
        stop = setupSubagents({ activity: false, counts: false });
        const { c } = finished();
        const row = c.row('tool-c1');
        expect(shown(row, 'name')).toBe('Researcher');
        expect(shown(row, 'activity')).toBeNull();
        expect(shown(row, 'note')).toBeNull();
    });

    it('activity: false keeps one line, with nothing on it that grows while it works', () => {
        stop = setupSubagents({ activity: false });
        const { c } = working();
        expect(shown(c.row('tool-c1'), 'activity')).toBeNull();
        expect(shown(c.row('tool-c1'), 'note')).toBeNull();
    });

    it('activity: false puts what it did after the state, once it is over', () => {
        stop = setupSubagents({ activity: false });
        const { c } = finished();
        expect(shown(c.row('tool-c1'), 'activity')).toBeNull();
        expect(shown(c.row('tool-c1'), 'note')).toBe('2 tools · 12s');
    });

    it('counts: false says what it did in the state word, so the second line stays', () => {
        stop = setupSubagents({ counts: false });
        const { c } = finished();
        expect(shown(c.row('tool-c1'), 'activity')).toBe('Done');
    });

    it('follows a language switch: the words are read again in the new language and plural rules', () => {
        stop = setupSubagents();
        const { c } = finished();
        aparteGlobalConfig.extendLocale({ tag: 'fr' });
        expect(shown(c.row('tool-c1'), 'activity')).toMatch(/^2 outils · 12\s?s$/);
        aparteGlobalConfig.extendLocale({ tag: 'ru' });
        expect(shown(c.row('tool-c1'), 'activity')).toMatch(/^2 инструмента · /);
        // The app's own words win over the plugin's table.
        aparteGlobalConfig.extendLocale({ tag: 'en', subagentsTools: 'one:{n} step|other:{n} steps' });
        expect(shown(c.row('tool-c1'), 'activity')).toBe('2 steps · 12s');
    });

    it('says it is starting in the chat\'s language', () => {
        stop = setupSubagents();
        aparteGlobalConfig.extendLocale({ tag: 'fr' });
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Researcher', toolCallId: 'c1' },
        );
        expect(shown(c.row('tool-c1'), 'activity')).toBe('Démarrage…');
    });
});
