import { describe, it, expect, afterEach } from 'vitest';
import { AparteConfig, AparteConfigClass } from '../aparte-config';
import { resolveConfig, attachConfig, detachConfig, APARTE_HOST_ATTR } from '../config-context';

describe('config-context — per-instance resolution seam', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('global fallback (no behaviour change until a config is attached)', () => {
        it('returns the global singleton for null/undefined', () => {
            expect(resolveConfig(null)).toBe(AparteConfig);
            expect(resolveConfig(undefined)).toBe(AparteConfig);
        });

        it('returns the global singleton for an element under no boundary', () => {
            const el = document.createElement('div');
            document.body.appendChild(el);
            expect(resolveConfig(el)).toBe(AparteConfig);
        });
    });

    describe('instance boundaries', () => {
        it('resolves a boundary element to its own attached config', () => {
            const host = document.createElement('div');
            const cfg = new AparteConfigClass();
            attachConfig(host, cfg);
            expect(resolveConfig(host)).toBe(cfg);
        });

        it('marks the boundary with the data-aparte-host attribute', () => {
            const host = document.createElement('div');
            attachConfig(host, new AparteConfigClass());
            expect(host.hasAttribute(APARTE_HOST_ATTR)).toBe(true);
        });

        it('resolves a descendant to the nearest ancestor boundary', () => {
            const host = document.createElement('div');
            const child = document.createElement('span');
            const grandchild = document.createElement('em');
            host.appendChild(child);
            child.appendChild(grandchild);
            document.body.appendChild(host);
            const cfg = new AparteConfigClass();
            attachConfig(host, cfg);
            expect(resolveConfig(grandchild)).toBe(cfg);
        });

        it('resolves to the NEAREST boundary when boundaries are nested', () => {
            const outer = document.createElement('div');
            const inner = document.createElement('div');
            const leaf = document.createElement('span');
            outer.appendChild(inner);
            inner.appendChild(leaf);
            document.body.appendChild(outer);
            const outerCfg = new AparteConfigClass();
            const innerCfg = new AparteConfigClass();
            attachConfig(outer, outerCfg);
            attachConfig(inner, innerCfg);
            expect(resolveConfig(leaf)).toBe(innerCfg);
            expect(resolveConfig(outer)).toBe(outerCfg);
        });

        it('detachConfig removes the boundary — descendants fall back to the global', () => {
            const host = document.createElement('div');
            const child = document.createElement('span');
            host.appendChild(child);
            document.body.appendChild(host);
            attachConfig(host, new AparteConfigClass());
            expect(resolveConfig(child)).not.toBe(AparteConfig);
            detachConfig(host);
            expect(host.hasAttribute(APARTE_HOST_ATTR)).toBe(false);
            expect(resolveConfig(child)).toBe(AparteConfig);
        });
    });

    describe('instances are isolated', () => {
        it('two instances hold independent model config', () => {
            const a = new AparteConfigClass();
            const b = new AparteConfigClass();
            a.setModelConfig({ defaultProvider: 'anthropic', defaultModel: 'claude' });
            b.setModelConfig({ defaultProvider: 'google', defaultModel: 'gemini' });
            expect(a.getModelConfig().defaultProvider).toBe('anthropic');
            expect(b.getModelConfig().defaultProvider).toBe('google');
        });

        it('a fresh instance does not inherit the global singleton state', () => {
            AparteConfig.setModelConfig({ defaultProvider: 'global-provider' });
            const fresh = new AparteConfigClass();
            expect(fresh.getModelConfig().defaultProvider).toBeUndefined();
        });
    });
});
