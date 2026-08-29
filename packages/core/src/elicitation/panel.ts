/**
 * buildElicitationPanel — turns an {@link AparteElicitationSchema} into a DOM panel
 * that the presenter mounts into the composer. Zero-dependency; covers all four
 * schema kinds (enum, boolean, string, object). The presenter reads `getContent`
 * on submit and `isComplete` to gate the send button (via `onChange`).
 */

import type {
    AparteElicitationSchema,
    AparteElicitationField,
    AparteElicitationEnumField,
    AparteElicitationBooleanField,
    AparteElicitationStringField,
} from './types.js';
import { uuid } from '../utils/uuid.js';
import { contextConfig } from '../config/config-context.js';

/**
 * One per stepped panel built, so its tab ids are unique in the document. A counter
 * rather than a random id: two panels can share a page (the workbench mounts two
 * chats), and a test that asserts on an id should not have to guess it.
 */
let steppedPanelSeq = 0;

export interface BuiltElicitationPanel {
    readonly el: HTMLElement;
    /**
     * The corner where the presenter puts its escape from the WHOLE request.
     *
     * Top-right, away from anything that answers a question — and the position is the
     * whole point. This affordance lived in a row at the bottom, beside the button
     * that advances through the form, and adjacency made a promise the behaviour does
     * not keep: next to "next question", "Skip" reads as "skip THIS question", while
     * it declines everything (MCP's `decline`, including questions already answered).
     *
     * That is also why the reference implementations put theirs in a corner, which I
     * had read as a preference for the glyph. It is not about the glyph.
     *
     * A row at the bottom is gone with it, and so is the reserved height it needed:
     * with the composer's own button carrying advance-then-submit, the panel has no
     * action of its own left to place.
     */
    readonly dismiss: HTMLElement;
    /** The current response content, shaped to match the schema. */
    getContent(): unknown;
    /** True when every required field has a usable value. */
    isComplete(): boolean;
    /** Focus the first input (called after mount). */
    focus(): void;
    /**
     * What the composer's one button means for this panel: `'submit'`, or `'none'`
     * when the panel has no act for it and it should not be drawn.
     *
     * It used to have a third value, `'advance'`, while a form had more questions
     * ahead: the button turned into a chevron and moved to the next question. That
     * was a second way to do what a chip already does — the chips ARE the navigation,
     * forwards and back — and a button that changes meaning under the pointer is one
     * more thing to explain. The reference products settle it the same way: a click
     * on a choice selects, a tab switches question, one button submits the lot. So
     * the button means submit throughout, enabled once every question has an answer,
     * which is what `canProceed()` reports.
     *
     * `'none'` is for the shape where the button has no meaning at all: a single
     * question whose options settle on the click. Assignable to the composer's
     * `AparteComposerPanelMode` and deliberately spelled out rather than imported —
     * this layer describes what the PANEL has, and knows nothing about the element
     * that presents it.
     */
    mode(): 'submit' | 'none';
    /** Whether that button is enabled: every required question answered. */
    canProceed(): boolean;
    /** Kept for the presenter's contract; a form does nothing here — submitting is the presenter's. */
    proceed(): void;
    /**
     * Settled from INSIDE the panel: an option was clicked and that click is the
     * whole answer. The value is the content, shaped like `getContent()`.
     *
     * The same contract `BuiltApprovalPanel.onSettle` already has, and presented by
     * the same path — because it is the same act. A single-choice question is one
     * gesture, not a value you pick and then submit: WCAG's SC 3.2.2 and its F36
     * failure are about auto-submitting a form when an INPUT is set, which is why
     * these options are buttons rather than radios that fire on change.
     *
     * Only ever called for that shape. A form, a multi-select and a text field all
     * collect a value and resolve through the composer's button as before.
     */
    onSettle(cb: (content: unknown) => void): void;
    /**
     * Re-apply every string this panel took from the locale, in place.
     *
     * Bound by the same rule as a segment renderer's `relabel`: text and attributes
     * only, no node added or removed. A panel cannot be rebuilt on a language switch
     * — the reader may be halfway through typing an answer, or three questions into
     * a form — so the strings move and the DOM does not.
     *
     * Only the DEFAULTS move. A label the app supplied (`trueLabel`, a field's
     * `title`) is the app's copy and is left alone, which is why the closures are
     * registered where the default is used rather than at the end.
     */
    relabel(): void;
}

/**
 * Relabel closures for the panel currently being built.
 *
 * Ambient rather than threaded through six signatures, and safe because panel
 * construction is strictly synchronous: `buildElicitationPanel` sets this, calls the
 * builder, and restores it in a `finally`, so two panels can never share a list.
 * `contextConfig()` in this same file is read the same way for the same reason.
 */
let _relabels: Array<() => void> | null = null;

/** Register one way to re-apply one default. A no-op outside a build. */
function onRelabel(fn: () => void): void { _relabels?.push(fn); }

interface BuiltField {
    readonly el: HTMLElement;
    getValue(): unknown;
    isComplete(): boolean;
    focus(): void;
    /**
     * Whether this field has an act for the composer's button at all.
     *
     * Absent means yes, which is every field that collects a VALUE: you fill it in,
     * then you submit. A field that SETTLES — a single choice, rendered as buttons —
     * answers on the click and has nothing for that button until its free-text
     * escape is opened, at which point there is text to submit and this turns true.
     *
     * Read only by the single-field shape. A form always submits, and the fields in
     * one are built without a `settle` so this is never defined there.
     */
    offersSubmit?(): boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

/**
 * The label an option shows. Identical in both shapes; only what wraps it differs —
 * and the approval panel draws its options with it too, so a scope written as a
 * `description` sits under its label the same way in both panels.
 */
export function optionBody(label: string, description?: string, recommended?: boolean): HTMLElement {
    const body = el('span', 'aparte-elic-option-body');
    const title = el('span', 'aparte-elic-option-title', label);
    if (recommended) {
        // Said, not only tinted: a tint is a hint the eye may miss and a screen reader
        // never gets. The reference products write it into the label.
        const badge = el('span', 'aparte-tag aparte-tag--sm aparte-elic-option-badge',
            contextConfig().t('elicitationRecommended') || 'Recommended');
        title.append(' ', badge);
    }
    body.appendChild(title);
    if (description) body.appendChild(el('span', 'aparte-elic-option-desc', description));
    return body;
}

/**
 * An option that IS the answer: a button, settled on the first click.
 *
 * The approval panel's recipe, unchanged, because it is the same object — and its
 * comment in `elicitation.css` carries the measurements behind it: no colour (a solid
 * intent fill gives 2.19:1 against its own label on the dark palette), a column and
 * not a row of pills (the composer is narrow enough to wrap a real option label), and
 * read from the start rather than centred.
 */
function commandOption(label: string, description?: string, recommended?: boolean): HTMLButtonElement {
    const button = el('button', 'aparte-btn aparte-btn--block aparte-btn--surface aparte-elic-option aparte-elic-option--command'
        + (recommended ? ' aparte-elic-option--recommended' : ''));
    button.type = 'button';
    button.appendChild(optionBody(label, description, recommended));
    return button;
}

/**
 * Write the field's title and description, and return the id of the title.
 *
 * The id is what lets a group of radios be NAMED by its question. Without it the
 * options were announced with nothing attached to them: a screen reader read
 * "Chromium, radio button, 1 of 2" and never the question it answered, because
 * nothing tied the `<p>` above the list to the list itself.
 */
function fieldHeader(parent: HTMLElement, field: AparteElicitationField, skipTitle?: string): string | undefined {
    let titleId: string | undefined;
    // A single-question request carries the question in the panel's MESSAGE, and the
    // adapter also sets it as the field's title so a stepped form can label its
    // chips — so the same sentence was printed twice, one line apart. Whoever set
    // both meant one question, not two.
    if (field.title && field.title.trim() !== skipTitle?.trim()) {
        const title = el('p', 'aparte-elic-title', field.title);
        titleId = `elic-title-${uuid()}`;
        title.id = titleId;
        parent.appendChild(title);
    }
    if (field.description) parent.appendChild(el('p', 'aparte-elic-desc', field.description));
    return titleId;
}

/**
 * Name a group of choices, and say what kind of group it is.
 *
 * `radiogroup` is only correct for radios; a multi-select is a plain `group`. The
 * name comes from the field's own title when it has one (the multi-question form),
 * and otherwise from the panel's message — which IS the question in the
 * single-question form, and would otherwise leave the group unnamed.
 */
function labelGroup(list: HTMLElement, opts: { multiple?: boolean; commands?: boolean; titleId?: string; fallbackLabel?: string }): void {
    // `radiogroup` describes a set of INPUTS you choose among and then submit. When the
    // options are buttons that settle on the click they are commands, so the group is a
    // plain `group` — and there is no roving `tabindex` to add with it: that is required
    // for `radiogroup`/`toolbar`/`listbox`/`menu`, not for command buttons, which are
    // each their own tab stop the way a dialog's buttons are.
    list.setAttribute('role', opts.multiple || opts.commands ? 'group' : 'radiogroup');
    if (opts.titleId) list.setAttribute('aria-labelledby', opts.titleId);
    else if (opts.fallbackLabel) list.setAttribute('aria-label', opts.fallbackLabel);
}

// ─── enum ────────────────────────────────────────────────────────────────────

function buildEnumField(
    field: AparteElicitationEnumField,
    onChange: () => void,
    fallbackLabel?: string,
    settle?: (value: unknown) => void,
): BuiltField {
    const wrap = el('div', 'aparte-elic-field aparte-elic-enum');
    const titleId = fieldHeader(wrap, field, fallbackLabel);
    const list = el('div', 'aparte-elic-options');
    const name = `elic-${uuid()}`;
    const type = field.multiple ? 'checkbox' : 'radio';
    /*
     * The recipe that matches the input's own type. These used to be native controls
     * tinted with `accent-color`, which is the one part of a form the browser still
     * draws itself — so the panel's controls were the only thing in the library whose
     * look changed with the OS, and on the dark palette they came out of a light-mode
     * UA as a pale box on a dark row.
     */
    const controlRecipe = type === 'checkbox' ? 'aparte-checkbox' : 'aparte-radio';
    // The field wins when it says something — that is the APP calling
    // `requestUserInput` directly. Otherwise it is the host's policy, not a
    // hardcoded `true` and no longer anything the model can decide.
    const allowOther = field.allowOther ?? contextConfig().getElicitationOptions().allowOther;
    const defaults = new Set(Array.isArray(field.default) ? field.default : field.default != null ? [field.default] : []);

    /*
     * ONE CHOICE IS ONE ACT, so the options are buttons and the click is the answer.
     *
     * Radios plus the composer's button spend two gestures on one decision, which is
     * not how any chat asks a question — and the accessibility argument runs the same
     * way, not against it. WCAG SC 3.2.2 ("On Input") and its F36 failure forbid
     * submitting automatically when an INPUT is given a value; a radio that fires on
     * change is exactly that. A button is an explicit activation, which is what F36
     * says to rely on instead. Auto-advancing radios is separately a documented
     * accessibility barrier (it removes the chance to review and change a selection);
     * a command button has nothing to review.
     *
     * Three conditions, each load-bearing:
     *  - `settle` is only passed by the SINGLE-field shape. A form collects values and
     *    submits them together, and settling on its last question would be F36 word
     *    for word.
     *  - not `multiple`: a multi-select accumulates, so it needs a commit.
     *  - no `default`: a button cannot be pre-selected. A requester that supplied one
     *    asked for a pre-filled, reviewable answer — MCP's "SHOULD pre-populate" — and
     *    gets the radios that can honour it.
     */
    const settling = settle != null && !field.multiple && defaults.size === 0;
    labelGroup(list, { multiple: field.multiple, commands: settling, titleId, fallbackLabel });

    const buildOption = (value: string, label: string, description?: string, recommended?: boolean): HTMLElement => {
        if (settling) {
            const button = commandOption(label, description, recommended);
            button.addEventListener('click', () => settle?.(value));
            return button;
        }
        const row = el('label', 'aparte-field-choice aparte-elic-option' + (recommended ? ' aparte-elic-option--recommended' : ''));
        const control = el('input', controlRecipe + ' aparte-elic-control');
        control.type = type;
        control.name = name;
        control.value = value;
        if (defaults.has(value)) control.checked = true;
        row.append(control, optionBody(label, description, recommended));
        return row;
    };

    for (const opt of field.options) {
        list.appendChild(buildOption(opt.value, opt.label ?? opt.value, opt.description, opt.recommended));
    }

    // Free-text "Other…" fallback.
    let otherText: HTMLInputElement | null = null;
    /** Settling only: the escape has been opened, so there is now text to submit. */
    let otherOpen = false;
    if (allowOther) {
        // Localised, like every other string the user reads. These four were
        // hardcoded English, which showed as an English "Other…" and "Skip" above
        // questions in the user's own language — visible the first time a French
        // model asked something. The locale keys are OPTIONAL, so an existing
        // locale package keeps compiling and falls back to English per key.
        const t = contextConfig();
        otherText = el('input', 'aparte-field aparte-elic-other-input');
        otherText.type = 'text';
        otherText.placeholder = t.t('elicitationOtherPlaceholder');
        otherText.style.display = 'none';
        otherText.setAttribute('aria-label', t.t('elicitationOtherLabel'));
        const otherInput = otherText;

        /*
         * The one option that does NOT settle, in either shape.
         *
         * Picking "Other…" is not an answer, it is a request to write one — so here it
         * reveals the field and hands the composer's button back its meaning (the
         * panel flips from `'none'` to `'submit'`). Structurally the approval panel's
         * instruction field, and the same reason: submitting written text is exactly
         * the act that button already means.
         */
        if (settling) {
            const button = commandOption(t.t('elicitationOther'));
            button.classList.add('aparte-elic-option--other');
            button.setAttribute('aria-expanded', 'false');
            button.addEventListener('click', () => {
                otherOpen = true;
                button.setAttribute('aria-expanded', 'true');
                otherInput.style.display = '';
                otherInput.focus();
                onChange();
            });
            const otherTitle = button.querySelector('.aparte-elic-option-title') as HTMLElement;
            onRelabel(() => {
                const now = contextConfig();
                otherTitle.textContent = now.t('elicitationOther');
                otherInput.placeholder = now.t('elicitationOtherPlaceholder');
                otherInput.setAttribute('aria-label', now.t('elicitationOtherLabel'));
            });
            list.append(button, otherInput);
        } else {
            // `aparte-field-choice` like every sibling row, which it was missing: with
            // no recipe there is no `display: flex`, so the control stacked ABOVE its
            // own label while the options above it sat inline. It also had no focus
            // outline, for the same reason — the recipe carries that too.
            const row = el('label', 'aparte-field-choice aparte-elic-option aparte-elic-option--other');
            const control = el('input', controlRecipe + ' aparte-elic-control');
            control.type = type;
            control.name = name;
            control.value = '__other__';
            const body = el('span', 'aparte-elic-option-body');
            const otherTitle = el('span', 'aparte-elic-option-title', t.t('elicitationOther'));
            body.appendChild(otherTitle);
            onRelabel(() => {
                const now = contextConfig();
                otherTitle.textContent = now.t('elicitationOther');
                otherInput.placeholder = now.t('elicitationOtherPlaceholder');
                otherInput.setAttribute('aria-label', now.t('elicitationOtherLabel'));
            });
            body.appendChild(otherText);
            row.append(control, body);
            list.appendChild(row);
        }
    }
    wrap.appendChild(list);

    const controls = () => Array.from(list.querySelectorAll<HTMLInputElement>('.aparte-elic-control'));
    const other = () => list.querySelector<HTMLInputElement>('input[value="__other__"]');
    list.addEventListener('change', () => {
        const o = other();
        if (o && otherText) {
            otherText.style.display = o.checked ? '' : 'none';
            if (o.checked) otherText.focus();
        }
        onChange();
    });
    otherText?.addEventListener('input', onChange);

    const typedOther = (): string => otherText?.value.trim() ?? '';

    if (settling) {
        // Every real option has already answered by the time anything reads this, so
        // the only value this shape can still hold is the free text.
        return {
            el: wrap,
            getValue: () => typedOther(),
            isComplete: () => otherOpen && typedOther() !== '',
            focus: () => list.querySelector<HTMLButtonElement>('.aparte-elic-option--command')?.focus(),
            offersSubmit: () => otherOpen,
        };
    }

    const getValue = (): string | string[] => {
        const otherVal = other()?.checked && typedOther() ? typedOther() : '';
        if (field.multiple) {
            const vals = controls().filter(c => c.checked && c.value !== '__other__').map(c => c.value);
            if (otherVal) vals.push(otherVal);
            return vals;
        }
        const checked = controls().find(c => c.checked);
        if (!checked) return '';
        return checked.value === '__other__' ? otherVal : checked.value;
    };

    return {
        el: wrap,
        getValue,
        isComplete: () => {
            const v = getValue();
            return field.multiple ? (v as string[]).length > 0 : v !== '';
        },
        focus: () => controls()[0]?.focus(),
    };
}

// ─── boolean ───────────────────────────────────────────────────────────────

function buildBooleanField(
    field: AparteElicitationBooleanField,
    onChange: () => void,
    fallbackLabel?: string,
    settle?: (value: unknown) => void,
): BuiltField {
    const wrap = el('div', 'aparte-elic-field aparte-elic-boolean');
    const titleId = fieldHeader(wrap, field, fallbackLabel);
    const list = el('div', 'aparte-elic-options');
    const name = `elic-${uuid()}`;
    // A yes/no asked on its own is the same act as any other single choice, so it
    // follows the same rule — see `settling` in `buildEnumField` for why, and for why
    // a supplied `default` keeps the radios that can honour it.
    const settling = settle != null && field.default == null;
    labelGroup(list, { commands: settling, titleId, fallbackLabel });

    if (settling) {
        const t = contextConfig();
        const mkCommand = (val: boolean, label: string, defaulted?: 'elicitationYes' | 'elicitationNo'): void => {
            const button = commandOption(label);
            button.addEventListener('click', () => settle?.(val));
            if (defaulted) {
                const title = button.querySelector('.aparte-elic-option-title') as HTMLElement;
                onRelabel(() => { title.textContent = contextConfig().t(defaulted); });
            }
            list.appendChild(button);
        };
        mkCommand(true, field.trueLabel ?? t.t('elicitationYes'), field.trueLabel ? undefined : 'elicitationYes');
        mkCommand(false, field.falseLabel ?? t.t('elicitationNo'), field.falseLabel ? undefined : 'elicitationNo');
        wrap.appendChild(list);
        return {
            el: wrap,
            // Never read: the click settles, so nothing downstream asks this shape for
            // a value. `false` rather than a throw keeps the field total.
            getValue: () => false,
            isComplete: () => false,
            focus: () => list.querySelector<HTMLButtonElement>('.aparte-elic-option--command')?.focus(),
            offersSubmit: () => false,
        };
    }

    const mk = (val: 'true' | 'false', label: string, defaulted?: 'elicitationYes' | 'elicitationNo'): void => {
        const row = el('label', 'aparte-field-choice aparte-elic-option');
        const control = el('input', 'aparte-radio aparte-elic-control');
        control.type = 'radio';
        control.name = name;
        control.value = val;
        if (field.default != null && String(field.default) === val) control.checked = true;
        const body = el('span', 'aparte-elic-option-body');
        const title = el('span', 'aparte-elic-option-title', label);
        // Registered only when the LOCALE supplied the label. A `trueLabel` the app
        // passed is its copy, in whatever language it chose, and a language switch
        // has no business rewriting it.
        if (defaulted) onRelabel(() => { title.textContent = contextConfig().t(defaulted); });
        body.appendChild(title);
        row.append(control, body);
        list.appendChild(row);
    };
    const t = contextConfig();
    mk('true', field.trueLabel ?? t.t('elicitationYes'), field.trueLabel ? undefined : 'elicitationYes');
    mk('false', field.falseLabel ?? t.t('elicitationNo'), field.falseLabel ? undefined : 'elicitationNo');
    wrap.appendChild(list);
    list.addEventListener('change', onChange);

    const checked = () => list.querySelector<HTMLInputElement>('input:checked');
    return {
        el: wrap,
        getValue: () => checked()?.value === 'true',
        isComplete: () => checked() != null,
        focus: () => list.querySelector<HTMLInputElement>('input')?.focus(),
    };
}

// ─── string ────────────────────────────────────────────────────────────────

function buildStringField(field: AparteElicitationStringField, onChange: () => void, fallbackLabel?: string): BuiltField {
    const wrap = el('div', 'aparte-elic-field aparte-elic-string');
    fieldHeader(wrap, field, fallbackLabel);
    const input = field.multiline
        ? el('textarea', 'aparte-field aparte-field--textarea aparte-elic-text')
        : el('input', 'aparte-field aparte-elic-text');
    if (!field.multiline) (input as HTMLInputElement).type = 'text';
    if (field.placeholder) input.setAttribute('placeholder', field.placeholder);
    if (field.default) (input as HTMLInputElement | HTMLTextAreaElement).value = field.default;
    if (field.maxLength != null) input.setAttribute('maxlength', String(field.maxLength));
    // The visible title is a `<p>`, not a `<label for>`, so the input needs its own
    // accessible name — and the panel's message is the question in the
    // single-question form. 'Your answer' is the last resort, localised like the rest.
    // `||`, not `??`. An EMPTY title or message is not a name — and `??` took it,
    // so a request with `message: ''` gave its input `aria-label=""`: no accessible
    // name at all, where the whole point of this line is that there always is one.
    // Found by a test written for the language switch, not for this.
    const ownName = field.title || field.description || fallbackLabel || undefined;
    input.setAttribute('aria-label', ownName ?? contextConfig().t('elicitationAnswerLabel'));
    if (ownName == null) {
        const named = input;
        onRelabel(() => { named.setAttribute('aria-label', contextConfig().t('elicitationAnswerLabel')); });
    }
    wrap.appendChild(input);
    input.addEventListener('input', onChange);

    const required = field.required ?? true;
    const value = () => (input as HTMLInputElement | HTMLTextAreaElement).value;
    return {
        el: wrap,
        getValue: () => value(),
        isComplete: () => {
            const v = value().trim();
            if (!required && v === '') return true;
            return v.length >= (field.minLength ?? 1);
        },
        focus: () => input.focus(),
    };
}

/**
 * The four schema kinds, exhaustively.
 *
 * `fallbackLabel` is the panel's message, passed down for the SINGLE-field shape
 * where the message is the question and the field itself carries no title — without
 * it, that field's group or input has no accessible name at all.
 *
 * `settle` is passed ONLY by that same single-field shape, and it is what lets a
 * choice answer on the click instead of waiting for the composer's button. A form
 * never passes it: its questions collect values that are submitted together.
 *
 * A consumer's field renderer gets no `settle` either, and that is the deliberate
 * escape: an app that wants the pick-then-submit shape back registers one.
 */
function buildField(
    field: AparteElicitationField,
    onChange: () => void,
    fallbackLabel?: string,
    key?: string,
    settle?: (value: unknown) => void,
): BuiltField {
    // A consumer's field wins, and `null` from it means "not this one" — which is
    // what lets an app replace only the choices and keep the built-in text input.
    const custom = contextConfig().getElicitationFieldRenderer()?.(field, { key, notifyChange: onChange });
    if (custom) {
        return {
            el: custom.el,
            getValue: () => custom.getValue(),
            isComplete: () => custom.isComplete(),
            focus: () => custom.focus?.(),
        };
    }
    switch (field.type) {
        case 'enum': return buildEnumField(field, onChange, fallbackLabel, settle);
        case 'boolean': return buildBooleanField(field, onChange, fallbackLabel, settle);
        // No `settle`: text is written, not chosen, so it always needs a commit.
        case 'string': return buildStringField(field, onChange, fallbackLabel);
    }
}

// ─── panel ─────────────────────────────────────────────────────────────────

export function buildElicitationPanel(
    message: string | (() => string),
    schema: AparteElicitationSchema,
    onChange: () => void,
): BuiltElicitationPanel {
    // A wrapper, so the builder below keeps its two return statements and needs no
    // restructuring: this owns the collector's lifetime and hands the result its
    // `relabel`. Restored in a `finally` because the builder can throw on a schema it
    // refuses, and a leaked collector would then attach one panel's closures to the
    // next one.
    const relabels: Array<() => void> = [];
    const outer = _relabels;
    _relabels = relabels;
    try {
        const built = buildPanel(message, schema, onChange);
        return { ...built, relabel: () => { for (const fn of relabels) fn(); } };
    } finally {
        _relabels = outer;
    }
}

function buildPanel(
    message: string | (() => string),
    schema: AparteElicitationSchema,
    onChange: () => void,
): Omit<BuiltElicitationPanel, 'relabel'> {
    const panel = el('div', 'aparte-elic-panel');
    // Resolved once, and deliberately not re-read on relabel: a question here comes
    // from the tool that asked, which means the MODEL wrote it. Re-reading a
    // model-authored sentence on a language switch would mean nothing.
    const asked = typeof message === 'function' ? message() : message;
    if (asked) panel.appendChild(el('p', 'aparte-elic-message', asked));

    /*
     * The click that IS the answer, for the shapes that have one.
     *
     * An indirection because the presenter registers its callback AFTER this builder
     * returns, exactly as `buildApprovalPanel` does. `settled` guards a double click
     * on its own rather than trusting the presenter to: this builder is public
     * (`buildElicitationPanel`), so someone writing their own presenter gets the
     * guarantee too.
     */
    let settleCb: ((content: unknown) => void) | null = null;
    let settled = false;
    const settle = (content: unknown): void => {
        if (settled) return;
        settled = true;
        settleCb?.(content);
    };
    const onSettle = (cb: (content: unknown) => void): void => { settleCb = cb; };

    /*
     * The QUESTIONS scroll; the actions do not.
     *
     * The panel is capped at 50vh, and one question with six options plus the
     * free-text escape already exceeded that — so with everything in one scroll box,
     * "Next" sat below the fold and "Skip" was off screen entirely. The primary way
     * forward is not something a user should have to scroll to find.
     *
     * Only visible with real layout: jsdom reports every height as 0, and the browser
     * test that walks this flow clicked Next by selector without ever asking whether
     * it was in view. Found by looking at a screenshot of the running app.
     */
    const body = el('div', 'aparte-elic-body');
    panel.appendChild(body);

    // The corner for the whole-request escape. First in the DOM so it is reachable
    // before the questions, positioned out of their way by CSS.
    const dismiss = el('div', 'aparte-elic-dismiss');
    panel.appendChild(dismiss);

    if (schema.type === 'object') {
        const entries = Object.entries(schema.properties);
        const requiredKeys = new Set(schema.required ?? entries.map(([k]) => k));
        const cfg = contextConfig();

        // Re-entrant: a field's change has to refresh the step nav (which chip is
        // answered, whether Next is available) BEFORE the presenter re-reads
        // isComplete() for the send button.
        let syncNav = (): void => {};
        const notify = (): void => { syncNav(); onChange(); };

        const fields = entries.map(([key, field]) => {
            const built = buildField(field, notify, undefined, key);
            // Ensure a title so each field in a form is labelled.
            if (!field.title && !built.el.querySelector('.aparte-elic-title')) {
                built.el.insertBefore(el('p', 'aparte-elic-title', key), built.el.firstChild);
            }
            body.appendChild(built.el);
            return { key, field: built, required: requiredKeys.has(key), header: field.header };
        });

        const isComplete = (): boolean => fields.every(f => !f.required || f.field.isComplete());
        const api: Omit<BuiltElicitationPanel, 'relabel'> = {
            el: panel,
            dismiss,
            getContent: () => Object.fromEntries(fields.map(f => [f.key, f.field.getValue()])),
            isComplete,
            focus: () => fields[0]?.field.focus(),
            // A form of one behaves like a single field; only a real form steps.
            mode: () => 'submit',
            canProceed: isComplete,
            proceed: () => {},
            // A form never settles from inside: its questions are collected and
            // submitted together, and answering the last one on the click would be
            // WCAG's F36 word for word. Registered so the shape is total; never fired.
            onSettle,
        };

        // ONE QUESTION AT A TIME, past the first.
        //
        // Stacking every question in one box was inherited from MCP elicitation
        // without examining it: MCP describes a FORM for collecting structured data,
        // which is a different thing from asking a person two questions in the middle
        // of a conversation. No product does the latter by stacking — the shape they
        // all use is one question at a time with a chip per question, and it is what
        // `header` exists for. `layout: 'stacked'` keeps the form case, because that
        // case is real; it is just not the default.
        //
        // `isComplete()` is deliberately unchanged — still "every required field" —
        // so the protocol is untouched and the composer's send button still means
        // submit. Moving between questions is the chips' affordance, and only theirs.
        if (fields.length < 2 || cfg.getElicitationOptions().layout !== 'stepped') return api;

        panel.classList.add('aparte-elic-panel--stepped');
        let current = 0;

        /*
         * A scope for the ids below. Two stepped panels can share a document (the
         * workbench mounts two chats), and a duplicate id makes `aria-controls` point at
         * whichever one parsed first — so the relationship the role promises would be
         * wrong rather than merely missing.
         */
        const scope = `aparte-elic-${++steppedPanelSeq}`;
        const steps = el('div', 'aparte-tabs aparte-tabs--underline aparte-elic-steps');
        steps.setAttribute('role', 'tablist');
        const chips = fields.map((f, i) => {
            const chip = el('button', 'aparte-tabs__tab aparte-elic-step');
            chip.type = 'button';
            chip.setAttribute('role', 'tab');
            // The position when the model gave no short label: honest, and it never
            // truncates a sentence into nonsense.
            chip.textContent = f.header?.trim() || String(i + 1);
            // A chip is how you go BACK. Free navigation rather than a Previous
            // button: an answer you have already given is the thing you most want to
            // revisit, and hunting for a Back button to do it is the frustrating
            // half of every stepped form.
            chip.addEventListener('click', () => { show(i); f.field.focus(); });
            /*
             * The pattern's obligations, which this had announced and not kept: a tab
             * POINTS at its panel, the panel names the tab back, and a tablist is ONE tab
             * stop with arrows inside it rather than one stop per chip. Without them the
             * role told a screen-reader user to expect a relationship and a keyboard model
             * that were not there — worse than the plain buttons the chips actually were.
             */
            chip.id = `${scope}-tab-${i}`;
            f.field.el.id = `${scope}-panel-${i}`;
            f.field.el.setAttribute('role', 'tabpanel');
            f.field.el.setAttribute('aria-labelledby', chip.id);
            chip.setAttribute('aria-controls', f.field.el.id);
            chip.addEventListener('keydown', (e: KeyboardEvent) => {
                const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
                let next = -1;
                if (step) next = (i + step + fields.length) % fields.length;
                else if (e.key === 'Home') next = 0;
                else if (e.key === 'End') next = fields.length - 1;
                if (next < 0) return;
                e.preventDefault();
                show(next);
                chips[next]?.focus();
            });
            steps.appendChild(chip);
            return chip;
        });
        // Above the scroll region rather than inside it: the chips are navigation.
        panel.insertBefore(steps, body);

        /*
         * There is no "Next", and that is the point.
         *
         * A stepped form usually grows a Next button, and this one did: which then
         * needed a disabled state, a hidden state on the last question, a row that
         * reserved its height so hiding it did not move the panel, and a rule about
         * whether it or the composer's send button was the real submit. Four rules to
         * support one button.
         *
         * The reference implementations do not have it. Clicking a tab is the
         * navigation — which is also how you go BACK, so one affordance does both —
         * and the only button is the submit. Removing it deleted every one of those
         * four rules with it.
         */
        function show(index: number): void {
            current = index;
            fields.forEach((f, i) => { f.field.el.hidden = i !== index; });
            syncNav();
        }

        syncNav = (): void => {
            chips.forEach((chip, i) => {
                chip.setAttribute('aria-selected', String(i === current));
                // The roving tab stop: Tab reaches the tablist once, arrows move within it.
                chip.tabIndex = i === current ? 0 : -1;
                // Answered, so a reader sees at a glance what is left — and with no
                // Next button this is the ONLY progress signal, along with the send
                // button staying disabled until every question has an answer. A check
                // mark, not only a colour: a colour is what the current chip also has.
                const answered = fields[i]!.field.isComplete();
                chip.toggleAttribute('data-answered', answered);
                const mark = chip.querySelector('.aparte-elic-step__mark');
                if (answered && !mark) {
                    const glyph = el('span', 'aparte-elic-step__mark');
                    glyph.setAttribute('aria-hidden', 'true');
                    glyph.innerHTML = cfg.getIcon('check');
                    chip.prepend(glyph);
                } else if (!answered && mark) {
                    mark.remove();
                }
            });
        };

        show(0);
        // Same contract as the stacked form: the button means submit throughout and
        // needs every question answered. The chips are the only navigation — a
        // "next" on the composer's button was a second way to do what a chip does,
        // and a button that changes meaning under the pointer.
        return {
            ...api,
            focus: () => fields[current]?.field.focus(),
        };
    }

    // The single-field shape: the panel's message IS the question, so it names the
    // field. In the object shape each field carries its own title instead.
    //
    // The ONE place `settle` is handed out. A question asked on its own is one act,
    // so a choice here answers on the click; everything that still collects a value —
    // a multi-select, a text field, a choice carrying a `default` — ignores it and
    // keeps the composer's button, which is what `offersSubmit` reports back.
    // The host can withhold it (`answerOnClick: false`): then a single choice keeps
    // its radios and commits through the button like every other question — the
    // field builders see no `settle` at all, so nothing else has to know.
    const answerOnClick = contextConfig().getElicitationOptions().answerOnClick;
    const field = buildField(schema, onChange, asked, undefined, answerOnClick ? settle : undefined);
    body.appendChild(field.el);
    return {
        el: panel,
        dismiss,
        getContent: () => field.getValue(),
        isComplete: () => field.isComplete(),
        focus: () => field.focus(),
        mode: () => ((field.offersSubmit?.() ?? true) ? 'submit' : 'none'),
        canProceed: () => field.isComplete(),
        proceed: () => {},
        onSettle,
    };
}
