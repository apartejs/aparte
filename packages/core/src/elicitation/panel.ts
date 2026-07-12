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

function fieldHeader(parent: HTMLElement, field: AparteElicitationField): void {
    if (field.title) parent.appendChild(el('p', 'aparte-elic-title', field.title));
    if (field.description) parent.appendChild(el('p', 'aparte-elic-desc', field.description));
}

// ─── enum ────────────────────────────────────────────────────────────────────

function buildEnumField(field: AparteElicitationEnumField, onChange: () => void): BuiltField {
    const wrap = el('div', 'aparte-elic-field aparte-elic-enum');
    fieldHeader(wrap, field);
    const list = el('div', 'aparte-elic-options');
    const name = `elic-${crypto.randomUUID()}`;
    const type = field.multiple ? 'checkbox' : 'radio';
    const allowOther = field.allowOther ?? true;
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
        body.appendChild(el('span', 'aparte-elic-option-title', 'Other…'));
        otherText = el('input', 'aparte-elic-other-input');
        otherText.type = 'text';
        otherText.placeholder = 'Type your answer…';
        otherText.style.display = 'none';
        otherText.setAttribute('aria-label', 'Custom answer');
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

function buildBooleanField(field: AparteElicitationBooleanField, onChange: () => void): BuiltField {
    const wrap = el('div', 'aparte-elic-field aparte-elic-boolean');
    fieldHeader(wrap, field);
    const list = el('div', 'aparte-elic-options');
    const name = `elic-${crypto.randomUUID()}`;
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
    mk('true', field.trueLabel ?? 'Yes');
    mk('false', field.falseLabel ?? 'No');
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

function buildStringField(field: AparteElicitationStringField, onChange: () => void): BuiltField {
    const wrap = el('div', 'aparte-elic-field aparte-elic-string');
    fieldHeader(wrap, field);
    const input = field.multiline
        ? el('textarea', 'aparte-elic-text')
        : el('input', 'aparte-elic-text');
    if (!field.multiline) (input as HTMLInputElement).type = 'text';
    if (field.placeholder) input.setAttribute('placeholder', field.placeholder);
    if (field.default) (input as HTMLInputElement | HTMLTextAreaElement).value = field.default;
    if (field.maxLength != null) input.setAttribute('maxlength', String(field.maxLength));
    input.setAttribute('aria-label', field.title ?? field.description ?? 'Your answer');
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

function buildField(field: AparteElicitationField, onChange: () => void): BuiltField {
    switch (field.type) {
        case 'enum': return buildEnumField(field, onChange);
        case 'boolean': return buildBooleanField(field, onChange);
        case 'string': return buildStringField(field, onChange);
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
            const built = buildField(field, onChange);
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

    const field = buildField(schema, onChange);
    panel.appendChild(field.el);
    return {
        el: panel,
        getContent: () => field.getValue(),
        isComplete: () => field.isComplete(),
        focus: () => field.focus(),
    };
}
