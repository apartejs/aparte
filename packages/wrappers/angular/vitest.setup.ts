// Zone.js first: the components use Angular's default (zone-based) change
// detection, so the test platform needs it (NG0908) — it must load before
// `@angular/core/testing`.
import 'zone.js';
import 'zone.js/testing';
// The JIT compiler must be loaded BEFORE initTestEnvironment: the specs mount
// standalone components compiled in Ivy *partial* mode, which fall back to JIT here.
import '@angular/compiler';
import '@analogjs/vitest-angular/setup-snapshots';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { TestBed } from '@angular/core/testing';

/**
 * Idempotent, and loudly so.
 *
 * `initTestEnvironment` throws NG0402 on a second call, and this file is a setup
 * file — evaluated once per worker environment today, but that is a property of
 * vitest's pooling, not a guarantee. An audit recorded one run where all four
 * Angular specs failed together and it was never reproduced; a double
 * initialisation is the mechanism that would produce exactly that shape.
 *
 * The flag lives on `globalThis` because a module-scope one would not help: a
 * second evaluation gets a fresh module scope, which is the very case being
 * guarded.
 *
 * It warns rather than passing quietly. If the condition behind that unexplained
 * run ever happens again, the log says so in one line instead of leaving 74 opaque
 * failures — and a swallowed `try/catch` here would have hidden the only evidence.
 */
const INIT_FLAG = '__aparteAngularTestEnvInitialised';
const g = globalThis as Record<string, unknown>;
if (g[INIT_FLAG]) {
    console.warn(
        '[aparte] the Angular test setup was evaluated twice in one worker. '
        + 'TestBed is already initialised, so this run reuses it. If specs fail oddly '
        + 'from here, THIS is why — vitest pooled two files into one environment.',
    );
} else {
    g[INIT_FLAG] = true;
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
}
