/**
 * The `@aparte/core/icons` entry point.
 *
 * A flat re-export of `icons/index.ts`, and it exists for one reason: `tsc` mirrors the
 * source tree into `dist`, so a nested entry emits `dist/icons/index.d.ts` while Vite
 * emits `dist/icons.js` beside it. Package `exports` can point `types` at the nested
 * path — `publint` and `attw` both pass on that — but a consumer whose TypeScript
 * resolves the old way looks for a declaration file NEXT TO the JavaScript, finds none,
 * and gets `any`. The docs' own snippet check is such a consumer, which is how this was
 * caught. Flat here means `dist/icons.js` and `dist/icons.d.ts` are siblings and every
 * resolution mode agrees.
 */

export * from './icons/index.js';
