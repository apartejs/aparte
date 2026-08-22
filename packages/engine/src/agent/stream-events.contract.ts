/**
 * stream-events.contract.ts — COMPILE-TIME guard for the core↔engine run-event mirror.
 *
 * `StreamRunEvent` (this package) and `AparteStreamRunEvent` (@aparte/core's adapter)
 * are hand-mirrored across the zero-import boundary: core is the zero-dep leaf and must
 * never import engine, and engine keeps its stream contract standalone (see
 * `stream-events.ts`). That leaves the two unions synced BY HAND — the seam's one
 * unguarded soft spot. A silent drift here (a renamed/added variant, a changed payload
 * field) would corrupt streaming with no CI signal.
 *
 * This file makes that drift a TYPECHECK ERROR. It ships nothing: it only declares
 * type aliases (erased) and `import type`s core (erased → no runtime dep, so the
 * runtime zero-import rule still holds; core is present as engine's dev/peer dep at
 * typecheck time). It is not imported by the barrel, so it stays out of the bundle.
 *
 * The ONE remaining difference is `run-done.usage`: core carries the rich
 * `AparteUsage` (extra named provider-timing fields — ttft/decode/phases/…), engine
 * the five common ones. Those are mutually assignable — extra OPTIONAL fields never
 * block an assignment — but not equal, so that field is normalized away before the
 * exact-equality comparison of everything else.
 *
 * It used to differ for another reason: `StreamUsage` carried an
 * `[key: string]: unknown` "opaque passthrough" signature. That signature was the
 * last thing making `runStreamAgent` un-assignable to `AparteStreamRunner`, because
 * `transportCall` is contravariant and core's `AparteUsage` has no index signature.
 * Worth naming plainly: this guard normalized away the exact field that broke the
 * seam, so it had been written AROUND the defect — every shape it compared matched,
 * while the one composition both packages exist for did not compile. Assertion 4
 * below is what closes that gap, and it is the one that checks the composition
 * itself rather than a shape.
 */
import type { AparteStreamRunEvent, AparteStreamRunEmitter, AparteStreamRunner } from '@aparte/core';
import type { StreamRunEvent, StreamRunEmitter } from './stream-events.js';

/** Invariant type-equality — distinguishes optional vs required and index signatures. */
type Equal<A, B> =
    (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
/** Compiles only when its argument is exactly `true`. */
type Expect<T extends true> = T;
/** Distributes over a union `A`: `true` iff every member is assignable to `B`. */
type Assignable<A, B> = A extends B ? true : false;

/** Erase the sole intentional difference (run-done.usage) before the equality check. */
type NormalizeRunDone<E> = E extends { type: 'run-done' } ? { type: 'run-done'; usage?: unknown } : E;

/**
 * Each element compiles only if its contract holds; a drift turns one into a
 * `false`, which fails `Expect<...>` and breaks the typecheck. Exported so it isn't
 * flagged as unused — this file is not re-exported by the barrel, so it never reaches
 * `@aparte/engine`'s public surface.
 *
 * 1. Every variant except `run-done.usage` is structurally identical (exact equality).
 * 2. The `run-done` usage stays forwardable engine→core (lets core's adapter treat it
 *    as `AparteUsage`).
 * 3. The emitter core injects into `runStreamAgent` satisfies engine's emitter contract.
 * 4. **`runStreamAgent` is actually assignable to `AparteStreamRunner`.** This was the
 *    hole: every mirror above compared event SHAPES, and all of them held, while the
 *    one composition the two packages exist to make —
 *    `new AparteClient({ streamRunner: runStreamAgent })` — did not compile.
 *    `StreamAgentMessage.content` was written to mirror `AparteChatMessage` and never
 *    followed it to `string | AparteContentPart[]`. Nothing in the repo assigned the
 *    two together (the seam test builds its own runner), so it had zero compile
 *    coverage anywhere, which is exactly why it shipped broken across five docs pages
 *    and a README. One line here is the whole guard.
 */
export type StreamEventContract = [
    Expect<Equal<NormalizeRunDone<StreamRunEvent>, NormalizeRunDone<AparteStreamRunEvent>>>,
    Expect<Assignable<StreamRunEvent, AparteStreamRunEvent>>,
    Expect<Assignable<AparteStreamRunEmitter, StreamRunEmitter>>,
    Expect<Assignable<typeof import('./stream-run.js')['runStreamAgent'], AparteStreamRunner>>,
];
