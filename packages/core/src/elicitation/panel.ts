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
    /** The current response content, shaped to match the schema. */
    getContent(): unknown;
    /** True when every required field has a usable value. */
    isComplete(): boolean;
    /** Focus the first input (called after mount). */
    focus(): void;
}

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
function fieldHeader(parent: HTMLElement, field: AparteElicitationField): string | undefined {
    let titleId: string | undefined;
    if (field.title) {
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
    const titleId = fieldHeader(wrap, field);
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
        body.appendChild(el('span', 'aparte-elic-option-title', t.t('elicitationOther')));
        otherText = el('input', 'aparte-elic-other-input');
        otherText.type = 'text';
        otherText.placeholder = t.t('elicitationOtherPlaceholder');
        otherText.style.display = 'none';
        otherText.setAttribute('aria-label', t.t('elicitationOtherLabel'));
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
    const titleId = fieldHeader(wrap, field);
    const list = el('div', 'aparte-elic-options');
    labelGroup(list, { titleId, fallbackLabel });
    const name = `elic-${uuid()}`;
    const mk = (val: 'true' | 'false', label: string): void => {
        const row = el('label', 'aparte-elic-option');
        const control = el('input', 'aparte-elic-control');
        control.type = 'radio';
        control.name = name;
        control.value = val;
        if (field.default != null && String(field.default) === val) control.checked = true;
        const body = el('span', 'aparte-elic-option-body');
        body.appendChild(el('span', 'aparte-elic-option-title', label));
        row.append(control, body);
        list.appendChild(row);
    };
    const t = contextConfig();
    mk('true', field.trueLabel ?? t.t('elicitationYes'));
    mk('false', field.falseLabel ?? t.t('elicitationNo'));
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
    fieldHeader(wrap, field);
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
    input.setAttribute('aria-label', field.title ?? field.description ?? fallbackLabel ?? contextConfig().t('elicitationAnswerLabel'));
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
    message: string,
    schema: AparteElicitationSchema,
    onChange: () => void,
): BuiltElicitationPanel {
    const panel = el('div', 'aparte-elic-panel');
    if (message) panel.appendChild(el('p', 'aparte-elic-message', message));

    if (schema.type === 'object') {
        const entries = Object.entries(schema.properties);
        const requiredKeys = new Set(schema.required ?? entries.map(([k]) => k));
        const fields = entries.map(([key, field]) => {
            const built = buildField(field, onChange, undefined, key);
            // Ensure a title so each field in a form is labelled.
            if (!field.title && !built.el.querySelector('.aparte-elic-title')) {
                built.el.insertBefore(el('p', 'aparte-elic-title', key), built.el.firstChild);
            }
            panel.appendChild(built.el);
            return { key, field: built, required: requiredKeys.has(key) };
        });
        return {
            el: panel,
            getContent: () => Object.fromEntries(fields.map(f => [f.key, f.field.getValue()])),
            isComplete: () => fields.every(f => !f.required || f.field.isComplete()),
            focus: () => fields[0]?.field.focus(),
        };
    }

    // The single-field shape: the panel's message IS the question, so it names the
    // field. In the object shape each field carries its own title instead.
    const field = buildField(schema, onChange, message);
    panel.appendChild(field.el);
    return {
        el: panel,
        getContent: () => field.getValue(),
        isComplete: () => field.isComplete(),
        focus: () => field.focus(),
    };
}
