import { Directive } from '@angular/core';

/**
 * Claims `<aparte-approval-mode>` in this app's templates.
 *
 * A plugin's element ships no Angular code — plugins stay framework-agnostic, and every
 * element of core already has its directive in `@aparte/angular`. A directive whose
 * selector is the tag is all a template needs to accept the element WITHOUT
 * `CUSTOM_ELEMENTS_SCHEMA`, a switch that turns template checking off for every unknown
 * tag in the component, typos included. The same few lines serve for any plugin's element
 * or one of your own; add `@Input()`s if you bind its attributes.
 */
@Directive({ selector: 'aparte-approval-mode', standalone: true })
export class AparteApprovalModeElement {}
