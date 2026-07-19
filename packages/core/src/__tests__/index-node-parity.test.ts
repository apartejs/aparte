// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import * as browser from '../index';
import * as node from '../index.node';

/**
 * Root-cause guard for the SSR "barrel drift" class of bug.
 *
 * `index.node.ts` is a hand-maintained mirror of `index.ts` MINUS the browser-only
 * custom-element classes (they extend `HTMLElement`, which is undefined in Node).
 * When a runtime value present in the browser barrel is forgotten here, any wrapper
 * that value-imports it crashes the ENTIRE wrapper barrel under SSR with
 * `does not provide an export named 'X'` — because every wrapper barrel re-exports
 * its `AparteUi`, which imports these interop helpers.
 *
 * A spot-check ("is symbol X present?") is exactly what let the mirror drift. This
 * enumerates the browser barrel's full RUNTIME surface and asserts index.node
 * exposes every non-custom-element export, so the mirror can never silently drift
 * again. (Type-only exports are erased and can't crash an import, so they're out of
 * scope here — this guards the crash class specifically.)
 */
describe('index.node — runtime export parity with the browser barrel', () => {
    it('mirrors every non-custom-element runtime export of index.ts', () => {
        const missing: string[] = [];
        for (const [name, value] of Object.entries(browser)) {
            // Custom-element classes are browser-only by design (they extend
            // HTMLElement); everything else must be on the SSR surface.
            if (typeof value === 'function' && value.prototype instanceof HTMLElement) continue;
            if (!(name in node)) missing.push(name);
        }
        expect(
            missing,
            `index.node is missing runtime exports present in index.ts (SSR barrel drift): ${missing.join(', ')}`,
        ).toEqual([]);
    });

    it('exposes the two interop helpers every wrapper AparteUi value-imports', () => {
        // The exact symbols whose omission crashed the wrapper barrels under SSR.
        expect(typeof (node as Record<string, unknown>).applyElementProps).toBe('function');
        expect(Array.isArray((node as Record<string, unknown>).DEFAULT_UI_EVENTS)).toBe(true);
    });
});
