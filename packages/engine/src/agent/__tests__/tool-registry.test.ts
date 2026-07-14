import { describe, it, expect } from 'vitest';
import { ToolRegistry, type Tool, type ToolMarker } from '../tool';

function mkTool(name: string, marker?: ToolMarker, isAvailable?: Tool['isAvailable']): Tool {
    return {
        descriptor: { name, description: `${name} desc`, parameters: { type: 'object', properties: {} } },
        handler: async () => `${name}-result`,
        ...(marker ? { marker } : {}),
        ...(isAvailable ? { isAvailable } : {}),
    };
}

describe('ToolRegistry — registration', () => {
    it('registers, looks up and lists tools', () => {
        const r = new ToolRegistry();
        const a = mkTool('a');
        r.register(a);
        expect(r.has('a')).toBe(true);
        expect(r.get('a')).toBe(a);
        expect(r.list()).toEqual([a]);
        expect(r.descriptors().map(d => d.name)).toEqual(['a']);
    });

    it('throws on duplicate registration', () => {
        const r = new ToolRegistry();
        r.register(mkTool('a'));
        expect(() => r.register(mkTool('a'))).toThrow(/already registered/);
    });

    it('unregisters and reports whether anything was removed', () => {
        const r = new ToolRegistry();
        r.register(mkTool('a'));
        expect(r.unregister('a')).toBe(true);
        expect(r.unregister('a')).toBe(false);
        expect(r.has('a')).toBe(false);
    });

    it('registerAll + clear', () => {
        const r = new ToolRegistry();
        r.registerAll([mkTool('a'), mkTool('b')]);
        expect(r.list()).toHaveLength(2);
        r.clear();
        expect(r.list()).toHaveLength(0);
    });
});

describe('ToolRegistry — getActiveDescriptors (marker filtering)', () => {
    const names = async (r: ToolRegistry, ctx?: Parameters<ToolRegistry['getActiveDescriptors']>[0]) =>
        (await r.getActiveDescriptors(ctx)).map(d => d.name);

    it('exposes tools with no marker (default mandatory_always) and mandatory_always', async () => {
        const r = new ToolRegistry();
        r.register(mkTool('none'));
        r.register(mkTool('mand', { mode: 'mandatory_always' }));
        expect(await names(r)).toEqual(['none', 'mand']);
    });

    it('never exposes disabled tools', async () => {
        const r = new ToolRegistry();
        r.register(mkTool('off', { mode: 'disabled' }));
        expect(await names(r)).toEqual([]);
    });

    it('auto_when_available honours isAvailable(ctx)', async () => {
        const r = new ToolRegistry();
        r.register(mkTool('yes', { mode: 'auto_when_available', reason: 'r' }, () => true));
        r.register(mkTool('no', { mode: 'auto_when_available', reason: 'r' }, () => false));
        expect(await names(r)).toEqual(['yes']);
    });

    it('auto_when_available with no isAvailable check defaults to available', async () => {
        const r = new ToolRegistry();
        r.register(mkTool('auto', { mode: 'auto_when_available', reason: 'r' }));
        expect(await names(r)).toEqual(['auto']);
    });

    it('awaits async isAvailable', async () => {
        const r = new ToolRegistry();
        r.register(mkTool('async', { mode: 'auto_when_available', reason: 'r' }, async () => true));
        expect(await names(r)).toEqual(['async']);
    });

    it('user_optional: defaultEnabled applies only when the user has NO preferences', async () => {
        const r = new ToolRegistry();
        r.register(mkTool('optDefault', { mode: 'user_optional', defaultEnabled: true }));
        r.register(mkTool('optOff', { mode: 'user_optional' }));
        r.register(mkTool('optOn', { mode: 'user_optional' }));

        // No preferences set → fall back to defaultEnabled.
        expect(await names(r)).toEqual(['optDefault']);

        // Once the user HAS a preferences set, it is authoritative: only tools in
        // the set are exposed (defaultEnabled no longer overrides an absent tool).
        const ctx = { preferences: { enabledTools: new Set(['optOn']) } };
        expect(await names(r, ctx)).toEqual(['optOn']);
    });

    it('a user-enabled flag overrides defaultEnabled=false', async () => {
        const r = new ToolRegistry();
        r.register(mkTool('opt', { mode: 'user_optional', defaultEnabled: false }));
        expect(await names(r, { preferences: { enabledTools: new Set(['opt']) } })).toEqual(['opt']);
    });
});
