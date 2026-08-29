// @vitest-environment jsdom
/**
 * The DOM-free entry says so when a DOM turns up.
 *
 * `@aparte/core`'s `.` export resolves `node` first, which is what makes an SSR import
 * safe — and what silently breaks every test runner, because a test runner IS Node: it
 * takes the `node` condition, jsdom then supplies `customElements`, and nothing upgrades.
 * `<aparte-chat>` stays a plain `HTMLElement`, every assertion about the element's own
 * properties fails, and no error anywhere names the cause. It cost this repo four
 * wrapper configs aliasing `@aparte/core` at `../../core/src/index.ts` — reaching into
 * another package's source, because there was no supported specifier to point at.
 *
 * There is one now (`@aparte/core/browser`), and `registerAllComponents()` on the node
 * entry names it. A warning rather than a throw: the environment is legal, only
 * surprising, and an SSR pass with a jsdom shim is a real thing.
 *
 * This file runs under jsdom deliberately, and says so in a directive on line 1 even
 * though jsdom is the package default. Vitest reads the FIRST comment of a file for an
 * environment directive, and this docblock originally spelled out the one its sibling
 * `index-node-ssr.test.ts` carries — so vitest read that mention as an instruction, ran
 * this file in Node, and the assertion "a DOM is present" failed against no DOM. The
 * sibling pins the DOM-less branch (a silent no-op); the two together are the contract.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('index.node — registerAllComponents with a DOM present', () => {
    it('warns, and names the entry to point the runner at', async () => {
        expect(typeof customElements).not.toBe('undefined');
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const mod = await import('../index.node.js');

        mod.registerAllComponents();

        expect(warn).toHaveBeenCalledTimes(1);
        const message = String(warn.mock.calls[0][0]);
        expect(message).toContain('@aparte/core/browser');
        expect(message).toContain('node');
    });

    it('still registers nothing — it reports, it does not define', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const mod = await import('../index.node.js');
        const before = customElements.get('aparte-chat');
        mod.registerAllComponents();
        expect(customElements.get('aparte-chat')).toBe(before);
    });
});
