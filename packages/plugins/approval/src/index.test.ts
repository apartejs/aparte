import { describe, it, expect } from 'vitest';
import * as plugin from './index.js';
import * as node from './index.node.js';

describe('@aparte/plugin-approval barrels', () => {
    it('the browser entry exports the setup, the table and the element', () => {
        expect(plugin.setupApproval).toBeTypeOf('function');
        expect(plugin.getApprovalController).toBeTypeOf('function');
        expect(plugin.createApprovalPolicy).toBeTypeOf('function');
        expect(plugin.APPROVAL_MODES).toEqual(['plan', 'ask', 'auto-edit', 'auto']);
        expect(plugin.AparteApprovalMode).toBeTypeOf('function');
    });

    it('the node entry exports everything but the element', () => {
        expect(node.setupApproval).toBe(plugin.setupApproval);
        expect(node.rulingFor).toBe(plugin.rulingFor);
        expect('AparteApprovalMode' in node).toBe(false);
    });
});
