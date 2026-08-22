// @vitest-environment jsdom
/**
 * The `aparte-artifact-ready` bookkeeping hook, and why it is installed by a
 * function call rather than by loading a module.
 *
 * It used to be a top-level `window.addEventListener` in `segment-renderers.ts`, and
 * it was surviving bundling by luck. `packages/core/package.json` declares
 * `sideEffects` without that file, so the module is advertised to bundlers as
 * side-effect-free while carrying a side effect; it was retained only because
 * another binding in the same module is used. A bundler was entitled to drop the
 * file, and pdf/xlsx/docx artifacts would then stop regenerating in a consumer's
 * production build while every local check stayed green.
 *
 * `sideEffects` cannot be corrected by naming the file either — the build bundles
 * into a content-hashed shared chunk, so there is no stable path to declare.
 *
 * So the hook is installed from the two registration entry points, and these tests
 * pin that: installed when renderers are registered, exactly once, however many
 * times you register. Registration necessarily precedes any artifact render, and the
 * data is only read while rendering one, so nothing moved later in a way that counts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AparteConfig } from '../../config/aparte-config.js';
import { registerDefaultRenderers, installDefaultRenderersOnce } from '../segment-renderers.js';

let added: string[] = [];
let spy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    added = [];
    spy = vi.spyOn(window, 'addEventListener').mockImplementation(((type: string) => {
        added.push(type);
    }) as typeof window.addEventListener);
});

afterEach(() => { spy.mockRestore(); });

const readyHooks = (): number => added.filter((t) => t === 'aparte-artifact-ready').length;

describe('the artifact-ready hook', () => {
    // ONE test, deliberately. The idempotence flag is module-level — it has to be,
    // since the listener writes into one module-level map and a second listener would
    // double-stamp the throttle and could suppress a legitimate regeneration. Vitest
    // isolates per FILE, so splitting this into three tests would have the first one
    // consume the install and leave the others asserting against a spent flag. I wrote
    // it that way first and the failures are what said so.
    it('is installed by registration, from either entry point, exactly once', () => {
        expect(readyHooks()).toBe(0);

        // The documented explicit path.
        registerDefaultRenderers(new AparteConfig());
        expect(readyHooks()).toBe(1);

        // A second config, and the lazy path the bubble uses on first render. Neither
        // adds a listener: the hook is per-page bookkeeping, not per-config.
        registerDefaultRenderers(new AparteConfig());
        installDefaultRenderersOnce(new AparteConfig());
        expect(readyHooks()).toBe(1);
    });
});
