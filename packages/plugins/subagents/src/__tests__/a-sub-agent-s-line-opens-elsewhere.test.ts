/**
 * A sub-agent's line opens its conversation elsewhere — when the app asks for it.
 *
 * `setupSubagents({ open: 'event' })` gives each sub-agent's line an Open button (core's
 * button recipe, at the end of the line, named in the reader's language) and makes a line with
 * nothing behind it open on a click anywhere. Pressing it dispatches `aparte-subagent-open`
 * with what a view needs. Without the option nothing changes: no button, no role, no tab stop,
 * no pointer (an affordance nobody answers is not drawn). With `details` too, the line keeps
 * opening its detail and only the button opens elsewhere: one click never means two things.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import { setupSubagents, type AparteSubagentOpenEventDetail, type SubagentsOptions } from '../index.js';
import { as, chat, frame } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

async function working(options: SubagentsOptions) {
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
        ),
    );
    await frame();
    return c;
}

const openButton = (row: Element | null): HTMLButtonElement | null =>
    row?.querySelector<HTMLButtonElement>(':scope > :is(.aparte-tool-line, .aparte-tool-summary) > .aparte-tool-open') ?? null;

/** Every `aparte-subagent-open` that reaches the page. */
function heard(): AparteSubagentOpenEventDetail[] {
    const details: AparteSubagentOpenEventDetail[] = [];
    document.body.addEventListener('aparte-subagent-open', (e) => details.push(e.detail));
    return details;
}

describe("a sub-agent's line, without `open`", () => {
    it('stays inert: no button, no role, no tab stop, no pointer mark', async () => {
        const c = await working({});
        const row = c.row('tool-c1')!;
        expect(openButton(row)).toBeNull();
        expect(row.hasAttribute('data-opens')).toBe(false);
        const line = row.querySelector(':scope > .aparte-tool-line')!;
        expect(line.hasAttribute('role')).toBe(false);
        expect(line.hasAttribute('tabindex')).toBe(false);
        const events = heard();
        row.querySelector<HTMLElement>('.aparte-tool-name')!.click();
        expect(events).toEqual([]);
    });
});

describe("a sub-agent's line, with `open: 'event'`", () => {
    it("wears core's button, named after the sub-agent", async () => {
        const c = await working({ open: 'event' });
        const row = c.row('tool-c1')!;
        const button = openButton(row)!;
        expect(button.tagName).toBe('BUTTON');
        expect(button.type).toBe('button');
        expect(button.classList.contains('aparte-btn')).toBe(true);
        expect(button.getAttribute('aria-label')).toBe('Open Researcher');
        expect(row.hasAttribute('data-opens')).toBe(true);
    });

    it('dispatches aparte-subagent-open with the reply, the sub-agent, its name and its call', async () => {
        const c = await working({ open: 'event' });
        const events = heard();
        let bubbled = false;
        c.host.addEventListener('aparte-subagent-open', (e) => { bubbled = e.bubbles && e.composed; });
        openButton(c.row('tool-c1'))!.click();
        expect(events).toEqual([{ messageId: 'a1', agentId: 'a1', name: 'Researcher', toolCallId: 'c1' }]);
        expect(bubbled).toBe(true);
    });

    it('opens on a click anywhere on a line with nothing behind it', async () => {
        const c = await working({ open: 'event' });
        const events = heard();
        c.row('tool-c1')!.querySelector<HTMLElement>('.aparte-tool-target')!.click();
        expect(events.map((d) => d.agentId)).toEqual(['a1']);
    });

    it('names a sub-agent no call opened by itself, without a call id', async () => {
        stop = setupSubagents({ open: 'event' });
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'agent-start', agentId: 'solo', name: 'Planner', description: 'Plan the work' },
        );
        await frame();
        const row = c.host.querySelector<HTMLElement>('.aparte-segment-tool-call[data-opens]')!;
        expect(row).not.toBeNull();
        const events = heard();
        openButton(row)!.click();
        expect(events).toEqual([{ messageId: 'a1', agentId: 'solo', name: 'Planner' }]);
    });

    it('says its name in the chat’s language', async () => {
        aparteGlobalConfig.extendLocale({ tag: 'fr' });
        const c = await working({ open: 'event' });
        expect(openButton(c.row('tool-c1'))!.getAttribute('aria-label')).toBe('Ouvrir Researcher');
    });
});

describe('with `details` too', () => {
    it('keeps the line for the disclosure, and only the button opens elsewhere', async () => {
        const c = await working({ open: 'event', details: 'transcript' });
        const row = c.row('tool-c1') as HTMLDetailsElement;
        expect(row.tagName).toBe('DETAILS');
        const events = heard();

        // The line toggles its detail and opens nothing elsewhere.
        row.querySelector<HTMLElement>(':scope > summary .aparte-tool-name')!.click();
        expect(row.open).toBe(true);
        expect(events).toEqual([]);

        // The button opens elsewhere and leaves the detail as it was.
        const button = openButton(row)!;
        expect(button.parentElement!.tagName).toBe('SUMMARY');
        button.click();
        expect(events.map((d) => d.agentId)).toEqual(['a1']);
        expect(row.open).toBe(true);
    });
});
