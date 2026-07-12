import { describe, it, expect } from 'vitest';
import { buildElicitationPanel } from '../panel';
import type { AparteElicitationSchema } from '../types';

const noop = () => {};

function select(panel: HTMLElement, value: string): void {
    const input = panel.querySelector<HTMLInputElement>(`input[value="${value}"]`)!;
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('buildElicitationPanel', () => {
    it('renders the message', () => {
        const p = buildElicitationPanel('Pick one', { type: 'enum', options: [{ value: 'a' }] }, noop);
        expect(p.el.querySelector('.aparte-elic-message')!.textContent).toBe('Pick one');
    });

    describe('enum', () => {
        const schema: AparteElicitationSchema = {
            type: 'enum',
            options: [{ value: 'react', label: 'React' }, { value: 'vue', label: 'Vue' }],
            allowOther: false,
        };
        it('is incomplete until a choice is made, then returns the value', () => {
            const p = buildElicitationPanel('?', schema, noop);
            expect(p.isComplete()).toBe(false);
            select(p.el, 'vue');
            expect(p.isComplete()).toBe(true);
            expect(p.getContent()).toBe('vue');
        });

        it('multiple returns an array of checked values', () => {
            const p = buildElicitationPanel('?', { ...schema, multiple: true } as AparteElicitationSchema, noop);
            select(p.el, 'react');
            select(p.el, 'vue');
            expect(p.getContent()).toEqual(['react', 'vue']);
        });

        it('honours the free-text "Other…" option', () => {
            const p = buildElicitationPanel('?', { type: 'enum', options: [{ value: 'a' }], allowOther: true }, noop);
            select(p.el, '__other__');
            const other = p.el.querySelector<HTMLInputElement>('.aparte-elic-other-input')!;
            other.value = 'svelte';
            other.dispatchEvent(new Event('input', { bubbles: true }));
            expect(p.getContent()).toBe('svelte');
            expect(p.isComplete()).toBe(true);
        });

        it('pre-selects the default', () => {
            const p = buildElicitationPanel('?', { ...schema, default: 'vue' } as AparteElicitationSchema, noop);
            expect(p.getContent()).toBe('vue');
        });
    });

    describe('boolean', () => {
        it('returns true/false and gates on selection', () => {
            const p = buildElicitationPanel('OK?', { type: 'boolean' }, noop);
            expect(p.isComplete()).toBe(false);
            select(p.el, 'true');
            expect(p.getContent()).toBe(true);
            select(p.el, 'false');
            expect(p.getContent()).toBe(false);
            expect(p.isComplete()).toBe(true);
        });

        it('uses custom labels', () => {
            const p = buildElicitationPanel('?', { type: 'boolean', trueLabel: 'Approve', falseLabel: 'Reject' }, noop);
            expect(p.el.textContent).toContain('Approve');
            expect(p.el.textContent).toContain('Reject');
        });
    });

    describe('string', () => {
        it('is incomplete while empty (required) and returns the text', () => {
            const p = buildElicitationPanel('Name?', { type: 'string' }, noop);
            expect(p.isComplete()).toBe(false);
            const input = p.el.querySelector<HTMLInputElement>('.aparte-elic-text')!;
            input.value = 'Paul';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            expect(p.isComplete()).toBe(true);
            expect(p.getContent()).toBe('Paul');
        });

        it('optional string is complete when empty', () => {
            const p = buildElicitationPanel('?', { type: 'string', required: false }, noop);
            expect(p.isComplete()).toBe(true);
        });

        it('renders a textarea when multiline', () => {
            const p = buildElicitationPanel('?', { type: 'string', multiline: true }, noop);
            expect(p.el.querySelector('textarea.aparte-elic-text')).not.toBeNull();
        });
    });

    describe('object (form)', () => {
        const schema: AparteElicitationSchema = {
            type: 'object',
            properties: {
                framework: { type: 'enum', options: [{ value: 'react' }, { value: 'vue' }] },
                notes: { type: 'string', required: false },
            },
            required: ['framework'],
        };
        it('returns a record and requires only the required fields', () => {
            const p = buildElicitationPanel('Setup', schema, noop);
            expect(p.isComplete()).toBe(false); // framework not chosen
            select(p.el, 'react');
            expect(p.isComplete()).toBe(true);  // notes optional
            expect(p.getContent()).toEqual({ framework: 'react', notes: '' });
        });

        it('labels each field (falls back to the key)', () => {
            const p = buildElicitationPanel('Setup', schema, noop);
            const titles = [...p.el.querySelectorAll('.aparte-elic-title')].map(t => t.textContent);
            expect(titles).toContain('framework');
            expect(titles).toContain('notes');
        });
    });

    it('fires onChange on input so the presenter can gate submit', () => {
        let changes = 0;
        const p = buildElicitationPanel('?', { type: 'enum', options: [{ value: 'a' }], allowOther: false }, () => { changes++; });
        select(p.el, 'a');
        expect(changes).toBeGreaterThan(0);
    });
});
