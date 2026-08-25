/**
 * `<aparte-model-selector>` as an Angular directive. Import it into a standalone
 * component:
 *
 * ```ts
 * import { AparteModelSelectorDirective } from '@aparte/plugin-model-selector/angular';
 * // @Component({ imports: [AparteModelSelectorDirective], … })
 * ```
 *
 * ## Why this entry point exists at all
 *
 * The other three frameworks learn a tag from a declaration merge, so `./react`, `./vue`
 * and `./svelte` carry no runtime — 0.04 kB each. Angular cannot: its template compiler
 * needs a CLASS claiming the selector, and `[persist]="true"` on a custom element writes
 * a property, which on an attribute-driven element is a silent no-op. So this one is real
 * code, and real code in an Angular library has to be compiled in partial-Ivy mode —
 * which is why the build runs `ngc` for these two files and Vite for everything else.
 *
 * It lives here rather than in `@aparte/angular` for the reason that governs all four:
 * a wrapper types what it depends on, and it depends on no plugin. A third-party plugin's
 * author cannot add a directive to our wrapper, so shipping ours from there would give
 * aparté's packages a privilege theirs could never have.
 *
 * `@angular/core` is an OPTIONAL peer: install this package without Angular and nothing
 * here is reachable, which is the point — you get the binding only if you can use it.
 */
export { AparteModelSelectorDirective, APARTE_ELEMENT_DIRECTIVES } from './generated/element.directives.js';
