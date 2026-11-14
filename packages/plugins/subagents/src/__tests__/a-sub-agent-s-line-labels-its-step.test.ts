/**
 * A sub-agent's line shows the label registered for its step, as the reply's waiting indicator does.
 *
 * A step is a name the server sends (`reread`); `config.registerStepLabel` says what to show for
 * it. The line's second line follows the same label — the chat's own config first, as for
 * every other word on the row — and shows a step nobody labelled as its name. A label is read
 * every time the line is drawn, so a language switch changes the words of a step still open,
 * and nothing is written into the sub-agent's saved conversation: the key and the label are both
 * live only.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { aparteGlobalConfig, AparteConfig, APARTE_DEFAULT_LOCALE, type AparteStepLabelContext } from '@aparte/core';
import { setupSubagents } from '../index.js';
import { as, chat, shown } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    document.body.innerHTML = '';
    stop?.();
    vi.restoreAllMocks();
    aparteGlobalConfig.reset();
});

const FR = { ...APARTE_DEFAULT_LOCALE, tag: 'fr-FR' };
const restoring = ({ locale }: AparteStepLabelContext): string =>
    locale.tag === 'fr-FR' ? 'Reprise de la mémoire…' : 'Restoring the memory…';

function started(options: Parameters<typeof chat>[0] = {}) {
    const c = chat(options);
    c.run(
        { type: 'run-start' },
        { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
        { type: 'agent-start', agentId: 'a1', name: 'Researcher', description: 'Find the callers', toolCallId: 'c1' },
        ...as('a1', { type: 'turn-start' }),
    );
    return c;
}

describe("a sub-agent's line labels its step", () => {
    it('says the label registered for the step, and goes back to what it said when the step ends', () => {
        stop = setupSubagents();
        aparteGlobalConfig.registerStepLabel('reread', 'Re-reading the conversation');
        const c = started();
        c.run(...as('a1', { type: 'step-start', name: 'reread' }));
        expect(shown(c.row('tool-c1'), 'activity')).toBe('Re-reading the conversation');
        c.run(...as('a1', { type: 'step-end', name: 'reread' }));
        expect(shown(c.row('tool-c1'), 'activity')).toBe('Starting…');
    });

    it('says a step nobody labelled as its name', () => {
        stop = setupSubagents();
        aparteGlobalConfig.registerStepLabel('reread', 'Re-reading the conversation');
        const c = started();
        c.run(...as('a1', { type: 'step-start', name: 'Reading the parser' }));
        expect(shown(c.row('tool-c1'), 'activity')).toBe('Reading the parser');
    });

    it('lets a running call win over the label, and says the label again once the call is done', () => {
        stop = setupSubagents();
        aparteGlobalConfig.registerStepLabel('reread', 'Re-reading the conversation');
        const c = started();
        c.run(...as('a1', { type: 'step-start', name: 'reread' }, { type: 'tool-start', toolCallId: 'g1', name: 'grep', input: {} }));
        expect(shown(c.row('tool-c1'), 'activity')).toBe('grep');
        c.run(...as('a1', { type: 'tool-resolved', toolCallId: 'g1', result: '3 hits' }));
        expect(shown(c.row('tool-c1'), 'activity')).toBe('Re-reading the conversation');
    });

    it('follows a language switch, on the line of a step still open', () => {
        stop = setupSubagents();
        aparteGlobalConfig.registerStepLabel('restore', restoring);
        const c = started();
        c.run(...as('a1', { type: 'step-start', name: 'restore' }));
        expect(shown(c.row('tool-c1'), 'activity')).toBe('Restoring the memory…');
        aparteGlobalConfig.setLocale(FR);
        expect(shown(c.row('tool-c1'), 'activity')).toBe('Reprise de la mémoire…');
    });

    it('is relabelled when a label is registered, or taken off, while the step is open', () => {
        stop = setupSubagents();
        const c = started();
        c.run(...as('a1', { type: 'step-start', name: 'reread' }));
        expect(shown(c.row('tool-c1'), 'activity')).toBe('reread');
        const off = aparteGlobalConfig.registerStepLabel('reread', 'Re-reading the conversation');
        expect(shown(c.row('tool-c1'), 'activity')).toBe('Re-reading the conversation');
        off();
        expect(shown(c.row('tool-c1'), 'activity')).toBe('reread');
    });

    it('reads the chat\'s own config before the page\'s', () => {
        stop = setupSubagents();
        aparteGlobalConfig.registerStepLabel('reread', 'The page\'s words');
        const own = new AparteConfig();
        own.registerStepLabel('reread', 'The chat\'s words');
        const inside = started({ config: own });
        inside.run(...as('a1', { type: 'step-start', name: 'reread' }));
        expect(shown(inside.row('tool-c1'), 'activity')).toBe('The chat\'s words');
    });

    it('writes neither the key nor the label into the sub-agent\'s saved conversation', () => {
        stop = setupSubagents();
        aparteGlobalConfig.registerStepLabel('reread', 'Re-reading the conversation');
        const c = started();
        c.run(...as('a1', { type: 'step-start', name: 'reread' }));
        const saved = JSON.stringify(c.segments());
        expect(saved).not.toContain('reread');
        expect(saved).not.toContain('Re-reading the conversation');
    });
});
