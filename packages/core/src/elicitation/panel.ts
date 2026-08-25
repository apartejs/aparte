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
     * What the composer's one button means on the question currently shown:
     * `'advance'` while there are more questions ahead, `'submit'` on the last.
     *
     * The composer already has a button, in a place the user knows, and it already
     * changes meaning (send / stop / submit). Giving it a fourth — advance — is why
     * this panel needs no "Next" of its own: no second row, no height that changes,
     * and the tabs stay for jumping around. It also makes the button honest, which a
     * check on a form with three questions left was not.
     */
    mode(): 'advance' | 'submit';
    /** Whether that button is enabled: this question answered, or all of them. */
    canProceed(): boolean;
    /** Act on it. Advancing shows the next question; submitting is the presenter's. */
    proceed(): void;
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
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
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
function labelGroup(list: HTMLElement, opts: { multiple?: boolean; titleId?: string; fallbackLabel?: string }): void {
    list.setAttribute('role', opts.multiple ? 'group' : 'radiogroup');
    if (opts.titleId) list.setAttribute('aria-labelledby', opts.titleId);
    else if (opts.fallbackLabel) list.setAttribute('aria-label', opts.fallbackLabel);
}

// ─── enum ────────────────────────────────────────────────────────────────────

function buildEnumField(field: AparteElicitationEnumField, onChange: () => void, fallbackLabel?: string): BuiltField {
    const wrap = el('div', 'aparte-elic-field aparte-elic-enum');
    const titleId = fieldHeader(wrap, field, fallbackLabel);
    const list = el('div', 'aparte-elic-options');
    labelGroup(list, { multiple: field.multiple, titleId, fallbackLabel });
    const name = `elic-${uuid()}`;
    const type = field.multiple ? 'checkbox' : 'radio';
    // The field wins when it says something — that is the APP calling
    // `requestUserInput` directly. Otherwise it is the host's policy, not a
    // hardcoded `true` and no longer anything the model can decide.
    const allowOther = field.allowOther ?? contextConfig().getElicitationOptions().allowOther;
    const defaults = new Set(Array.isArray(field.default) ? field.default : field.default != null ? [field.default] : []);

    const buildOption = (value: string, label: string, description?: string, recommended?: boolean): HTMLElement => {
        const row = el('label', 'aparte-elic-option' + (recommended ? ' aparte-elic-option--recommended' : ''));
        const control = el('input', 'aparte-elic-control');
        control.type = type;
        control.name = name;
        control.value = value;
        if (defaults.has(value)) control.checked = true;
        const body = el('span', 'aparte-elic-option-body');
        body.appendChild(el('span', 'aparte-elic-option-title', label));
        if (description) body.appendChild(el('span', 'aparte-elic-option-desc', description));
        row.append(control, body);
        return row;
    };

    for (const opt of field.options) {
        list.appendChild(buildOption(opt.value, opt.label ?? opt.value, opt.description, opt.recommended));
    }

    // Free-text "Other…" fallback.
    let otherText: HTMLInputElement | null = null;
    if (allowOther) {
        const row = el('label', 'aparte-elic-option aparte-elic-option--other');
        const control = el('input', 'aparte-elic-control');
        control.type = type;
        control.name = name;
        control.value = '__other__';
        const body = el('span', 'aparte-elic-option-body');
        // Localised, like every other string the user reads. These four were
        // hardcoded English, which showed as an English "Other…" and "Skip" above
        // questions in the user's own language — visible the first time a French
        // model asked something. The locale keys are OPTIONAL, so an existing
        // locale package keeps compiling and falls back to English per key.
        const t = contextConfig();
        const otherTitle = el('span', 'aparte-elic-option-title', t.t('elicitationOther'));
        body.appendChild(otherTitle);
        otherText = el('input', 'aparte-elic-other-input');
        otherText.type = 'text';
        otherText.placeholder = t.t('elicitationOtherPlaceholder');
        otherText.style.display = 'none';
        otherText.setAttribute('aria-label', t.t('elicitationOtherLabel'));
        const otherInput = otherText;
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

    const getValue = (): string | string[] => {
        const otherVal = other()?.checked && otherText?.value.trim() ? otherText.value.trim() : '';
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

function buildBooleanField(field: AparteElicitationBooleanField, onChange: () => void, fallbackLabel?: string): BuiltField {
    const wrap = el('div', 'aparte-elic-field aparte-elic-boolean');
    const titleId = fieldHeader(wrap, field, fallbackLabel);
    const list = el('div', 'aparte-elic-options');
    labelGroup(list, { titleId, fallbackLabel });
    const name = `elic-${uuid()}`;
    const mk = (val: 'true' | 'false', label: string, defaulted?: 'elicitationYes' | 'elicitationNo'): void => {
        const row = el('label', 'aparte-elic-option');
        const control = el('input', 'aparte-elic-control');
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
        ? el('textarea', 'aparte-elic-text')
        : el('input', 'aparte-elic-text');
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
 */
function buildField(field: AparteElicitationField, onChange: () => void, fallbackLabel?: string, key?: string): BuiltField {
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
        case 'enum': return buildEnumField(field, onChange, fallbackLabel);
        case 'boolean': return buildBooleanField(field, onChange, fallbackLabel);
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
        // submit. Advancing is the panel's own affordance.
        if (fields.length < 2 || cfg.getElicitationOptions().layout !== 'stepped') return api;

        panel.classList.add('aparte-elic-panel--stepped');
        let current = 0;

        const steps = el('div', 'aparte-elic-steps');
        steps.setAttribute('role', 'tablist');
        const chips = fields.map((f, i) => {
            const chip = el('button', 'aparte-elic-step');
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
                // Answered, so a reader sees at a glance what is left — and with no
                // Next button this is the ONLY progress signal, along with the send
                // button staying disabled until every question has an answer.
                chip.toggleAttribute('data-answered', fields[i]!.field.isComplete());
            });
        };

        show(0);
        const last = (): boolean => current === fields.length - 1;
        return {
            ...api,
            focus: () => fields[current]?.field.focus(),
            mode: () => (last() ? 'submit' : 'advance'),
            // Advancing needs only THIS question answered; submitting needs them all,
            // which is what stops the last question from accepting a form with a hole
            // in it.
            canProceed: () => (last() ? isComplete() : !!fields[current]?.field.isComplete()),
            proceed: () => {
                if (last()) return;
                show(current + 1);
                fields[current]?.field.focus();
            },
        };
    }

    // The single-field shape: the panel's message IS the question, so it names the
    // field. In the object shape each field carries its own title instead.
    const field = buildField(schema, onChange, asked);
    body.appendChild(field.el);
    return {
        el: panel,
        dismiss,
        getContent: () => field.getValue(),
        isComplete: () => field.isComplete(),
        focus: () => field.focus(),
        mode: () => 'submit',
        canProceed: () => field.isComplete(),
        proceed: () => {},
    };
}
