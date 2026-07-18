// @vitest-environment node
import { describe, it, expect } from 'vitest';

/**
 * SSR guard: `src/index.node.ts` is the entry resolved via the `node` export
 * condition. It MUST import cleanly in a Node environment (no DOM globals) —
 * regressions here (e.g. a shared module gaining a component import) would crash
 * `import '@aparte/core'` in Next.js / Nuxt / Angular Universal / SvelteKit.
 */
describe('index.node — SSR-safe entry', () => {
    it('has no DOM globals in this environment', () => {
        expect(typeof HTMLElement).toBe('undefined');
        expect(typeof document).toBe('undefined');
        expect(typeof window).toBe('undefined');
    });

    it('imports without touching the DOM and exposes the wrapper API', async () => {
        const mod = await import('../index.node');
        expect(typeof mod.AparteChatHost).toBe('function');
        expect(typeof mod.AparteClient).toBe('function');
        expect(typeof mod.AparteConversationController).toBe('function');
        expect(typeof mod.ConversationManager).toBe('function');
        expect(typeof mod.MessageRepository).toBe('function');
        expect(typeof mod.AparteConfig).toBe('object');
        expect(typeof mod.registerAllComponents).toBe('function');
    });

    it('registerAllComponents is a safe no-op on the server', async () => {
        const mod = await import('../index.node');
        expect(() => mod.registerAllComponents()).not.toThrow();
    });

    it('does NOT leak custom-element classes into the Node build', async () => {
        const mod = await import('../index.node') as Record<string, unknown>;
        // These are HTMLElement subclasses — browser-only; must be absent here.
        for (const name of ['AparteChatBubble', 'AparteComposer', 'AparteSelect', 'AparteConversationList']) {
            expect(mod[name], `${name} must not be exported from the Node build`).toBeUndefined();
        }
    });
});
