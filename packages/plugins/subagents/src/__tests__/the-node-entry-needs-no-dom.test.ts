// @vitest-environment node
/**
 * The DOM-free entry imports and works without a document.
 *
 * In Node, `@aparte/core` resolves to its own DOM-free barrel; this file points the import at
 * it (the package's test config aliases the browser one). `setupSubagents` installs its three
 * pieces on a config, and a saved conversation's sub-agents read the same as in a page.
 */
import { describe, it, expect, vi } from 'vitest';
// Imported at the top, not inside the test: loading core's whole source from TypeScript is the
// collection's cost, and inside the test it counted against the 5 s timeout — which a coverage
// run beside two hundred other files overran.
import * as core from '@aparte/core';
import { setupSubagents, subagentOf, subagentStatus, subagentTranscript } from '../index.node.js';

vi.mock('@aparte/core', async () => await import('../../../../core/src/index.node.js'));

describe('the node entry', () => {
    it('imports without a DOM, sets up, and reads a saved sub-agent', () => {
        expect(typeof document).toBe('undefined');
        const config = new core.AparteConfig();
        const stop = setupSubagents({}, config);
        expect(config.getRunEventObservers()).toHaveLength(1);
        const saved = {
            id: 'tool-c1', type: 'tool_call', status: 'aborted',
            toolCall: { id: 'c1', name: 'delegate', input: {} },
            subagent: { id: 'a1', name: 'Researcher', status: 'running', segments: [] },
        } as const;
        expect(subagentOf(saved as never)?.name).toBe('Researcher');
        expect(subagentStatus(saved as never)).toBe('stopped');
        // Its conversation has nowhere to be drawn without a document: no detail.
        expect(subagentTranscript(saved as never)).toBe('');
        // The observer runs without a DOM too: a run with a sub-agent, into a segment list.
        const list = core.createSegmentList({ messageId: 'm1' });
        const emit = core.createStreamAdapter({ target: list, config, messageId: 'm1' });
        emit({ type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} });
        emit({ type: 'agent-start', agentId: 'a1', name: 'Researcher', toolCallId: 'c1' });
        emit({ type: 'turn-start', agentId: 'a1' });
        emit({ type: 'text-delta', delta: 'Hello from Node.', agentId: 'a1' });
        emit({ type: 'run-done' });
        const lane = subagentOf(list.segments[0]!);
        expect(lane?.segments.map((s) => (s as { content?: string }).content)).toEqual(['Hello from Node.']);
        stop();
        // The setup with the conversation under the line installs the same way.
        const again = setupSubagents({ details: 'transcript' }, config);
        expect(config.getToolLineProvider()).toBeTypeOf('function');
        again();
    });
});
