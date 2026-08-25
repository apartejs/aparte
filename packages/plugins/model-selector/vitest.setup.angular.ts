/**
 * Boots Angular's TestBed so `src/__tests__/element.directives.spec.ts` can mount a real
 * template. Deliberately a copy of `packages/wrappers/angular/vitest.setup.ts` rather
 * than an import of it: this plugin must not depend on `@aparte/angular`, not even in a
 * dev-only path, because the whole point of owning its bindings is that a third-party
 * plugin could do the same without either of our packages. The long reasoning behind each
 * line lives in the wrapper's copy; per CLAUDE.md a shared layer waits for a third caller.
 */

// Zone.js first: the directives run under Angular's default (zone-based) change
// detection, so the platform needs it (NG0908), and it must load before
// `@angular/core/testing`.
import 'zone.js';
import 'zone.js/testing';
// The JIT compiler before initTestEnvironment: the spec mounts a standalone component,
// and the directive under test is emitted in Ivy *partial* mode, which falls back to JIT.
import '@angular/compiler';
import '@analogjs/vitest-angular/setup-snapshots';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { TestBed } from '@angular/core/testing';

/**
 * Idempotent, and it says so out loud rather than swallowing the case.
 *
 * `initTestEnvironment` throws NG0402 on a second call. The flag is on `globalThis`
 * because a module-scope one would not help: a second evaluation gets a fresh module
 * scope, which is the very thing being guarded.
 */
const INIT_FLAG = '__aparteModelSelectorAngularTestEnvInitialised';
const g = globalThis as Record<string, unknown>;
if (g[INIT_FLAG]) {
    console.warn(
        '[aparte] the plugin Angular test setup was evaluated twice in one worker. '
        + 'TestBed is already initialised, so this run reuses it. If specs fail oddly '
        + 'from here, THIS is why.',
    );
} else {
    g[INIT_FLAG] = true;
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
}
