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
        setupApproval({ classify, mode: 'auto-edit' }, aparteGlobalConfig);
        const el = mount();
        const options = [...el.querySelectorAll('aparte-option')].map((o) => o.getAttribute('value'));
        expect(options).toEqual(['plan', 'ask', 'auto-edit', 'auto']);
        expect(select(el)?.getAttribute('value')).toBe('auto-edit');
        expect(select(el)?.hasAttribute('disabled')).toBe(false);
        expect(el.mode).toBe('auto-edit');
    });

    it('a change on the select switches the mode and announces it', () => {
        const approval = setupApproval({ classify, mode: 'ask' }, aparteGlobalConfig);
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
        const approval = setupApproval({ classify, mode: 'ask' }, aparteGlobalConfig);
        const el = mount();
        approval.setMode('auto');
        expect(select(el)?.value).toBe('auto');
    });

    it('a removed element stops listening — the controller does not retain it', () => {
        const approval = setupApproval({ classify, mode: 'ask' }, aparteGlobalConfig);
        const el = mount();
        el.remove();
        approval.setMode('auto');
        expect(select(el)?.value, 'a detached switch is no longer synced').toBe('ask');
    });

    it('a setup that arrives after the element mounted wires it; one that goes away disables it', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const el = mount();
        expect(select(el)?.hasAttribute('disabled'), 'nothing to bind to yet').toBe(true);

        const approval = setupApproval({ classify, mode: 'plan' }, aparteGlobalConfig);
        expect(select(el)?.hasAttribute('disabled'), 'the config notified, the switch re-bound').toBe(false);
        expect(el.mode).toBe('plan');

        approval.dispose();
        expect(select(el)?.hasAttribute('disabled'), 'a switch wired to nothing is not offered').toBe(true);
        expect(el.mode).toBeNull();
    });

    it('the accessible name follows the locale, like the option labels', () => {
        setupApproval({ classify }, aparteGlobalConfig);
        const el = mount();
        expect(select(el)?.getAttribute('aria-label')).toBe('Approval mode');
        aparteGlobalConfig.setLocale({ ...aparteGlobalConfig.getLocale(), approvalModeLabel: "Mode d'approbation" });
        // A locale switch is a config change too; the same controller stays, the select is
        // rebuilt only when the binding changed — so read the name off a fresh mount.
        const fresh = mount();
        expect(select(fresh)?.getAttribute('aria-label')).toBe("Mode d'approbation");
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
        setupApproval({ classify }, aparteGlobalConfig);
        const el = mount();
        el.labels = { plan: 'Planifier', auto: 'Automatique' };
        const text = [...el.querySelectorAll('aparte-option')].map((o) => o.textContent?.trim());
        expect(text).toEqual(['Planifier', 'Ask', 'Auto-edit', 'Automatique']);
    });

    it('resolves the scoped config it sits in, not the global one', () => {
        const scoped = new AparteConfig();
        const approval = setupApproval({ classify, mode: 'plan' }, scoped);
        const host = document.createElement('div');
        attachConfig(host, scoped);
        document.body.appendChild(host);
        const el = document.createElement('aparte-approval-mode') as AparteApprovalMode;
        host.appendChild(el);
        expect(el.mode).toBe(approval.getMode());
        expect(el.mode).toBe('plan');
    });
});
