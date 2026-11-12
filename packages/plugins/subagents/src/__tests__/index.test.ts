/**
 * The two barrels: the browser entry and the DOM-free one export the same values.
 */
import { describe, it, expect } from 'vitest';
import * as plugin from '../index.js';
import * as node from '../index.node.js';

describe('@aparte/plugin-subagents barrels', () => {
    it('the browser entry exports the setup, the two readers and the segment type', () => {
        expect(plugin.setupSubagents).toBeTypeOf('function');
        expect(plugin.subagentOf).toBeTypeOf('function');
        expect(plugin.subagentStatus).toBeTypeOf('function');
        expect(plugin.SUBAGENT_SEGMENT_TYPE).toBe('subagent');
    });

    it('the node entry exports the same values', () => {
        expect(Object.keys(node).sort()).toEqual(Object.keys(plugin).sort());
        expect(node.setupSubagents).toBe(plugin.setupSubagents);
    });
});
