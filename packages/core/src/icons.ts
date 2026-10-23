/**
 * The `@aparte/core/icons` entry point.
 *
 * A flat re-export of `icons/index.ts`. `tsc` mirrors the source tree into `dist`, so a
 * nested entry emits `dist/icons/index.d.ts` while Vite emits `dist/icons.js` beside it.
 * Package `exports` can point `types` at the nested path (`publint` and `attw` both pass
 * on that), but a consumer whose TypeScript resolves the older way looks for a
 * declaration file NEXT TO the JavaScript, finds none, and gets `any`. Flat here means
 * `dist/icons.js` and `dist/icons.d.ts` are siblings and every resolution mode agrees.
 */

export * from './icons/index.js';
