import type { AparteControlChanges, AparteControlSpec } from '../utils/control.js';

/**
 * Control Renderer — swap every button aparté draws for one of your own.
 *
 * This is the seam that makes a design-system swap possible. Register one function and
 * **every control in the library** goes through it: the send button, the stop button, the
 * attach button, the bubble's copy / edit / retry / feedback row, the branch arrows, the
 * code block's copy, the scroll-to-bottom. Fourteen sites, one hook — which is only true
 * because they all already funnel through one spec.
 *
 * Without it, a class contract lets you *restyle* our button; it does not let you
 * *substitute* a different one. A `<p-button>` is not a style, it is another DOM.
 *
 * ## The contract
 *
 * You receive the {@link AparteControlSpec} — the control's inputs: which part it is, its
 * accessible label, its icon markup, whether it is disabled or hidden, its variant
 * modifiers and its `data-*`. You return an HTML **string** or a ready **HTMLElement**
 * (ratified decision #1: `string | HTMLElement`).
 *
 * **Core keeps the behaviour.** It attaches the click listener, writes `disabled` and
 * `hidden`, and rewrites the icon when the provider or the locale changes — on the node
 * you returned. So you own the look and the structure; you do not reimplement the wiring.
 *
 * **You do not have to carry our classes.** Core finds its own controls by
 * `data-aparte-control`, not by class name — the attribute is stamped for you if you did
 * not write it, and it carries no styling. That separation is deliberate: requiring
 * `spec.part` in your class list would drag our rules onto your button (the send button's
 * class paints a primary background), and a contract that fights the substitution it
 * enables is not a contract.
 *
 * ## What it costs, honestly, per kind of library
 *
 * - **A CSS framework** (Bootstrap, Tailwind) is trivial: return a string of markup
 *   wearing their classes.
 * - **A component library** (PrimeNG, Material, MUI) is real work. `<p-button>` is an
 *   Angular component, not markup — Angular will never compile a string you hand to
 *   `innerHTML`. You must create the component yourself
 *   (`ViewContainerRef.createComponent`) and return its host **node**. The signature
 *   allows it; it is not one line of config.
 *
 * @example
 * // Bootstrap: a string is enough.
 * aparteGlobalConfig.setControlRenderer({
 *   render: (spec) =>
 *     `<button type="button" class="btn btn-sm btn-outline-secondary"
 *              aria-label="${spec.label}" title="${spec.label}"
 *              ${spec.disabled ? 'disabled' : ''}>${spec.icon ?? ''}</button>`,
 * });
 *
 * @example
 * // Only the composer's send button, everything else left to the default.
 * aparteGlobalConfig.setControlRenderer({
 *   render: (spec) =>
 *     spec.part === 'aparte-composer-send__button'
 *       ? `<button type="button" class="my-send">${spec.icon ?? ''}</button>`
 *       : null,
 * });
 *
 * @example
 * // A framework component: the WRAPPER turns a component class into a node, and `update`
 * // is what keeps core's state writes reaching it.
 * // `@aparte/angular` would register this for you from `provideAparte({ controlComponent })`.
 * const refs = new WeakMap<HTMLElement, ComponentRef<MyButton>>();
 * aparteGlobalConfig.setControlRenderer({
 *   render: (spec) => {
 *     const ref = createComponent(MyButton, { environmentInjector });
 *     ref.setInput('label', spec.label);
 *     appRef.attachView(ref.hostView);
 *     refs.set(ref.location.nativeElement, ref);
 *     return ref.location.nativeElement;
 *   },
 *   update: (node, changes) => {
 *     if (changes.disabled !== undefined) refs.get(node)?.setInput('disabled', changes.disabled);
 *   },
 * });
 */
export interface AparteControlRenderer {
    /**
     * Build the control. Return an HTML **string**, a ready **HTMLElement**, or `null` to
     * leave this one to the default — so a partial swap needs no exhaustive switch.
     */
    render(spec: AparteControlSpec): HTMLElement | string | null | undefined;

    /**
     * Apply a state change to a control you built. Optional, and the reason this is an
     * object rather than a bare function.
     *
     * **Core writes state directly on the node it holds** — `disabled`, `hidden`, and the
     * icon when the provider or the locale changes. On a plain `<button>` that is exactly
     * right. On a framework component it does **nothing**: setting `.disabled` on a
     * `<p-button>` host does not touch the component's `@Input`, and no change detection
     * runs. The promise "core keeps the behaviour" would break silently, which is the worst
     * way for it to break.
     *
     * So when you return a framework component's node, implement this too: core tells you
     * *what changed*, you tell your component. Without it, core falls back to writing the
     * DOM itself — correct for markup, inert for a component.
     */
    update?(node: HTMLElement, changes: AparteControlChanges): void;
}
