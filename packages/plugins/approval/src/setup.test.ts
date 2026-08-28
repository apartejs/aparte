import { describe, it, expect, vi } from 'vitest';
import { AparteConfig } from '@aparte/core';
import { setupApproval, getApprovalController } from './approval.js';

const classify = { read: ['read_file'], write: ['write_file'], exec: ['run_command'] };
const call = (name: string) => ({ id: 'c', name, input: {} });

describe('setupApproval', () => {
    it('installs a policy on the given config, not the global one, and rules through it', () => {
        const cfg = new AparteConfig();
        const other = new AparteConfig();
        const approval = setupApproval(cfg, { classify });

        expect(cfg.getApprovalPolicy()).not.toBeNull();
        expect(other.getApprovalPolicy()).toBeNull();
        expect(getApprovalController(cfg)).toBe(approval);
        expect(getApprovalController(other)).toBeUndefined();

        // ask is the default mode: a write asks, a read runs, a command asks.
        expect(approval.getMode()).toBe('ask');
        expect(cfg.ruleOnToolCall(call('write_file')).verdict).toBe('ask');
        expect(cfg.ruleOnToolCall(call('read_file')).verdict).toBe('allow');
        expect(cfg.ruleOnToolCall(call('run_command')).verdict).toBe('ask');
    });

    it('a switch applies to the next call and tells every listener once', () => {
        const cfg = new AparteConfig();
        const onModeChange = vi.fn();
        const approval = setupApproval(cfg, { classify, mode: 'plan', onModeChange });
        expect(cfg.ruleOnToolCall(call('write_file')).verdict).toBe('deny');

        const listener = vi.fn();
        const off = approval.subscribe(listener);
        approval.setMode('auto');
        expect(cfg.ruleOnToolCall(call('write_file')).verdict).toBe('allow');
        expect(onModeChange).toHaveBeenCalledWith('auto', 'plan');
        expect(listener).toHaveBeenCalledWith('auto', 'plan');

        // Same mode again, or an unknown one: no switch, no call.
        approval.setMode('auto');
        approval.setMode('yolo' as never);
        expect(listener).toHaveBeenCalledTimes(1);
        off();
        approval.setMode('ask');
        expect(listener).toHaveBeenCalledTimes(1);
        expect(onModeChange).toHaveBeenCalledTimes(2);
    });

    it('an unclassified tool keeps its own needsApproval under every mode but auto', () => {
        const cfg = new AparteConfig();
        cfg.registerTool({ name: 'danger', description: '', inputSchema: {}, needsApproval: true }, (async () => 'ok') as never);
        cfg.registerTool({ name: 'safe', description: '', inputSchema: {} }, (async () => 'ok') as never);
        const approval = setupApproval(cfg, { classify, mode: 'plan' });
        expect(cfg.ruleOnToolCall(call('danger')).verdict).toBe('ask');
        expect(cfg.ruleOnToolCall(call('safe')).verdict).toBe('allow');
        approval.setMode('auto');
        expect(cfg.ruleOnToolCall(call('danger')).verdict).toBe('allow');
    });

    it('classify() exposes the setup\'s own reading of a name', () => {
        const approval = setupApproval(new AparteConfig(), { classify });
        expect(approval.classify('run_command')).toBe('exec');
        expect(approval.classify('nope')).toBeUndefined();
        expect(approval.modes).toEqual(['plan', 'ask', 'auto-edit', 'auto']);
    });

    it('a second setup on the same config replaces the first; dispose removes the policy', () => {
        const cfg = new AparteConfig();
        const first = setupApproval(cfg, { classify, mode: 'plan' });
        const firstListener = vi.fn();
        first.subscribe(firstListener);
        const second = setupApproval(cfg, { classify, mode: 'auto' });

        expect(getApprovalController(cfg)).toBe(second);
        expect(cfg.ruleOnToolCall(call('write_file')).verdict).toBe('allow');
        first.setMode('ask');
        expect(firstListener, 'the replaced setup dropped its listeners').not.toHaveBeenCalled();

        second.dispose();
        expect(cfg.getApprovalPolicy()).toBeNull();
        expect(getApprovalController(cfg)).toBeUndefined();
        // Disposing the stale first one must not remove the config's (now absent) policy of another setup.
        const third = setupApproval(cfg, { classify });
        first.dispose();
        expect(getApprovalController(cfg)).toBe(third);
        expect(cfg.getApprovalPolicy()).not.toBeNull();
    });

    it('dispose() leaves a policy it does not own — one the host set itself after the setup', () => {
        const cfg = new AparteConfig();
        const approval = setupApproval(cfg, { classify });
        const mine = () => ({ verdict: 'allow' as const });
        cfg.setApprovalPolicy(mine);
        expect(getApprovalController(cfg), 'a replaced policy reads as no setup').toBeUndefined();
        approval.dispose();
        expect(cfg.getApprovalPolicy(), 'the host\'s own policy survives the stale dispose').toBe(mine);
    });
});
