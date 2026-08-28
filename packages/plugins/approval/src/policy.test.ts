import { describe, it, expect } from 'vitest';
import { APPROVAL_MODES, classifyTool, rulingFor, createApprovalPolicy, type ApprovalMode, type ToolClass } from './policy.js';

const call = (name: string) => ({ id: 'c', name, input: {} });
const classify = { read: ['read_file', /^list_/], write: ['write_file'], exec: ['run_command'] };

describe('classifyTool', () => {
    it('matches a name exactly or by pattern, and exec wins over write over read', () => {
        expect(classifyTool('read_file', classify)).toBe('read');
        expect(classifyTool('list_dir', classify)).toBe('read');
        expect(classifyTool('write_file', classify)).toBe('write');
        expect(classifyTool('run_command', classify)).toBe('exec');
        expect(classifyTool('unknown', classify)).toBeUndefined();
        expect(classifyTool('x', { read: ['x'], exec: ['x'] })).toBe('exec');
    });
});

describe('rulingFor — the nine cells, plus the unclassified column', () => {
    const table: Record<ApprovalMode, Record<ToolClass, 'allow' | 'ask' | 'deny'>> = {
        plan: { read: 'allow', write: 'deny', exec: 'deny' },
        ask: { read: 'allow', write: 'ask', exec: 'ask' },
        'auto-edit': { read: 'allow', write: 'allow', exec: 'ask' },
        auto: { read: 'allow', write: 'allow', exec: 'allow' },
    };
    for (const mode of APPROVAL_MODES) {
        for (const cls of ['read', 'write', 'exec'] as const) {
            it(`${mode} × ${cls} → ${table[mode][cls]}`, () => {
                expect(rulingFor(mode, cls, call('t'))?.verdict).toBe(table[mode][cls]);
            });
        }
    }

    it('an unclassified tool gets no opinion — except under auto, which is auto', () => {
        expect(rulingFor('plan', undefined, call('t'))).toBeUndefined();
        expect(rulingFor('ask', undefined, call('t'))).toBeUndefined();
        expect(rulingFor('auto-edit', undefined, call('t'))).toBeUndefined();
        expect(rulingFor('auto', undefined, call('t'))?.verdict).toBe('allow');
    });

    it('a plan-mode refusal names the tool and what it does, and never says the user refused', () => {
        const r = rulingFor('plan', 'exec', call('run_command'));
        expect(r?.reason).toContain('`run_command`');
        expect(r?.reason).toContain('runs a command');
        expect(r?.reason).toContain('Plan mode');
        expect(r?.reason).not.toMatch(/user rejected/i);
        expect(rulingFor('plan', 'write', call('write_file'))?.reason).toContain('changes files');
    });
});

describe('createApprovalPolicy', () => {
    it('reads the mode on every call, so a switch applies to the next tool call', () => {
        let mode: ApprovalMode = 'plan';
        const policy = createApprovalPolicy(() => mode, classify);
        expect(policy(call('write_file'), undefined)?.verdict).toBe('deny');
        mode = 'auto';
        expect(policy(call('write_file'), undefined)?.verdict).toBe('allow');
        expect(policy(call('unknown'), undefined)?.verdict).toBe('allow');
        mode = 'ask';
        expect(policy(call('unknown'), undefined)).toBeUndefined();
    });
});
