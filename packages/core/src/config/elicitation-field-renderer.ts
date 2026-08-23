import type { AparteElicitationField } from '../elicitation/types.js';

/**
 * What the panel gives a custom field renderer.
 */
export interface AparteElicitationFieldContext {
    /**
     * The form key this field answers, in an object (multi-question) schema.
     * `undefined` for a single-field request, where the panel's message is the
     * question.
     */
    readonly key?: string;
    /**
     * Call whenever your field's value changes.
     *
     * The panel re-reads `isComplete()` on every change to enable or disable the
     * send button — a field that never notifies is a field whose answer can never
     * be submitted.
     */
    notifyChange(): void;
}

/**
 * A field you rendered, and the three things the panel needs from it.
 */
export interface AparteElicitationFieldControl {
    /** The element to place in the panel. */
    readonly el: HTMLElement;
    /** The current answer, shaped as the field's schema kind implies. */
    getValue(): unknown;
    /** Whether the answer is usable — gates the send button. */
    isComplete(): boolean;
    /** Focus the input. Called when the panel opens on this field. */
    focus?(): void;
}

/**
 * Elicitation Field Renderer
 *
 * Replace ONE field of the question panel — a choice, a yes/no, a free-text answer
 * — while the panel keeps everything around it: placement in the composer, the
 * accept/decline/cancel contract, the send-button gating, focus, and the teardown
 * when a turn is stopped.
 *
 * Until this existed the surface was all-or-nothing: the built-in panel, or
 * `setElicitationPresenter` and you reimplemented every one of those. Every other
 * customisation point in this library is a hook (charter §6), and this one was
 * missing.
 *
 * Return `null` to let the built-in render that field, which is what makes it
 * practical to override a single kind:
 *
 * @example
 * aparteGlobalConfig.setElicitationFieldRenderer((field, ctx) => {
 *   if (field.type !== 'enum') return null;          // built-in handles the rest
 *   const el = document.createElement('div');
 *   el.className = 'my-chips';
 *   let picked = '';
 *   for (const opt of field.options) {
 *     const b = document.createElement('button');
 *     b.type = 'button';
 *     b.textContent = opt.label ?? opt.value;
 *     b.onclick = () => { picked = opt.value; ctx.notifyChange(); };
 *     el.appendChild(b);
 *   }
 *   return { el, getValue: () => picked, isComplete: () => picked !== '' };
 * });
 *
 * **Why this returns a control and not `string | HTMLElement`** like the render
 * hooks in charter §6: a field has to hand back a VALUE. A hook that must also read
 * the user's input is a control, not a decoration, and pretending otherwise would
 * mean the panel scraping your markup for inputs by convention — which is a
 * contract that breaks silently the first time someone styles it differently.
 */
export type AparteElicitationFieldRenderer = (
    field: AparteElicitationField,
    ctx: AparteElicitationFieldContext,
) => AparteElicitationFieldControl | null;
