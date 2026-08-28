import { describe, it, expect, vi, afterEach } from 'vitest';
import { AparteConfig, aparteGlobalConfig, attachConfig } from '@aparte/core';
import { setupApproval } from './approval.js';
import { AparteApprovalMode } from './aparte-approval-mode.js';

const classify = { read: ['read_file'], write: ['write_file'], exec: ['run_command'] };

afterEach(() => {
    document.body.innerHTML = '';
    aparteGlobalConfig.reset();
    vi.restoreAllMocks();
});

const mount = (): AparteApprovalMode => {
    const el = document.createElement('aparte-approval-mode') as AparteApprovalMode;
    document.body.appendChild(el);
    return el;
};

const select = (el: HTMLElement) => el.querySelector('aparte-select') as (HTMLElement & { value: string }) | null;

describe('<aparte-approval-mode>', () => {
    it('is defined, renders the four modes in order, and shows the current one', () => {
        expect(customElements.get('aparte-approval-mode')).toBe(AparteApprovalMode);
        setupApproval(aparteGlobalConfig, { classify, mode: 'auto-edit' });
        const el = mount();
        const options = [...el.querySelectorAll('aparte-option')].map((o) => o.getAttribute('value'));
        expect(options).toEqual(['plan', 'ask', 'auto-edit', 'auto']);
        expect(select(el)?.getAttribute('value')).toBe('auto-edit');
        expect(select(el)?.hasAttribute('disabled')).toBe(false);
        expect(el.mode).toBe('auto-edit');
    });

    it('a change on the select switches the mode and announces it', () => {
        const approval = setupApproval(aparteGlobalConfig, { classify, mode: 'ask' });
        const el = mount();
        const announced = vi.fn();
        el.addEventListener('aparte-approval-mode-change', (e) => announced((e as CustomEvent).detail));

        select(el)!.dispatchEvent(new CustomEvent('aparte-select-change', {
            bubbles: true, detail: { value: 'plan', label: 'Plan', previousValue: 'ask' },
        }));

        expect(approval.getMode()).toBe('plan');
        expect(announced).toHaveBeenCalledWith({ mode: 'plan', previousMode: 'ask' });
        expect(aparteGlobalConfig.ruleOnToolCall({ id: 'c', name: 'write_file', input: {} }).verdict).toBe('deny');
    });

    it('a switch made elsewhere is reflected on the select', () => {
        const approval = setupApproval(aparteGlobalConfig, { classify, mode: 'ask' });
        const el = mount();
        approval.setMode('auto');
        expect(select(el)?.value).toBe('auto');
    });

    it('with no setup it renders disabled and says so once — an affordance that cannot act is not offered', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const el = mount();
        expect(select(el)?.hasAttribute('disabled')).toBe(true);
        expect(el.mode).toBeNull();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0]?.[0]).toContain('setupApproval');
    });

    it('labels can be replaced for a localised host', () => {
        setupApproval(aparteGlobalConfig, { classify });
        const el = mount();
        el.labels = { plan: 'Planifier', auto: 'Automatique' };
        const text = [...el.querySelectorAll('aparte-option')].map((o) => o.textContent?.trim());
        expect(text).toEqual(['Planifier', 'Ask', 'Auto-edit', 'Automatique']);
    });

    it('resolves the scoped config it sits in, not the global one', () => {
        const scoped = new AparteConfig();
        const approval = setupApproval(scoped, { classify, mode: 'plan' });
        const host = document.createElement('div');
        attachConfig(host, scoped);
        document.body.appendChild(host);
        const el = document.createElement('aparte-approval-mode') as AparteApprovalMode;
        host.appendChild(el);
        expect(el.mode).toBe(approval.getMode());
        expect(el.mode).toBe('plan');
    });
});
