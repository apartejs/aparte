import { describe, it, expect, vi, afterEach } from 'vitest';
import { AparteConfig, aparteGlobalConfig, attachConfig, releaseDeferredHydration } from '@aparte/core';
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

    it('waits inside a defer-hydration root, and draws once it is released', () => {
        setupApproval({ classify, mode: 'ask' }, aparteGlobalConfig);
        const root = document.createElement('div');
        root.setAttribute('defer-hydration', '');
        const el = document.createElement('aparte-approval-mode') as AparteApprovalMode;
        root.appendChild(el);
        document.body.appendChild(root);
        expect(el.childElementCount).toBe(0);
        releaseDeferredHydration(root);
        expect(select(el)?.getAttribute('value')).toBe('ask');
    });

    it('names the chat a switch came from, for a page with several', () => {
        setupApproval({ classify, mode: 'ask' }, aparteGlobalConfig);
        const chat = document.createElement('div');
        chat.setAttribute('data-aparte-chat', '');
        chat.id = 'chat-b';
        document.body.appendChild(chat);
        const el = document.createElement('aparte-approval-mode') as AparteApprovalMode;
        chat.appendChild(el);
        const announced = vi.fn();
        document.addEventListener('aparte-approval-mode-change', (e) => announced(e.detail), { once: true });
        select(el)!.dispatchEvent(new CustomEvent('aparte-select-change', {
            bubbles: true, detail: { value: 'plan', label: 'Plan', previousValue: 'ask' },
        }));
        expect(announced).toHaveBeenCalledWith({ mode: 'plan', previousMode: 'ask', targetId: 'chat-b' });
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

    // An app that keeps each conversation's mode sets it by code when the person switches
    // conversations. Only the person's own pick is a change to send: a value set by code, on the
    // controller or late on the select itself, came out as one, and the app saved a mode nobody
    // chose for the conversation now shown (apartejs/aparte#295).
    it('announces only a person\'s pick, never a mode or a select value set by code', async () => {
        const approval = setupApproval({ classify, mode: 'ask' }, aparteGlobalConfig);
        const el = mount();
        const announced = vi.fn();
        el.addEventListener('aparte-approval-mode-change', (e) => announced((e as CustomEvent).detail));

        approval.setMode('auto');
        approval.setMode('plan');
        // The previous conversation's mode, landing late on the select, by property and by attribute.
        select(el)!.value = 'ask';
        select(el)!.setAttribute('value', 'auto');
        // An echo may come a task later: waited for.
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(announced).not.toHaveBeenCalled();
        expect(approval.getMode()).toBe('plan');

        select(el)!.dispatchEvent(new CustomEvent('aparte-select-change', {
            bubbles: true, detail: { value: 'ask', label: 'Ask', previousValue: 'auto' },
        }));
        expect(announced).toHaveBeenCalledTimes(1);
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

    it('with no setup it renders disabled and says so once — an affordance that cannot act is not offered', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const el = mount();
        expect(select(el)?.hasAttribute('disabled')).toBe(true);
        expect(el.mode).toBeNull();
        await Promise.resolve();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0]?.[0]).toContain('setupApproval');
    });

    it('does not warn in the documented order: the tag first, then setupApproval() in the same script', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const el = mount();
        setupApproval({ classify, mode: 'ask' }, aparteGlobalConfig);
        await Promise.resolve();
        expect(warn).not.toHaveBeenCalled();
        expect(el.mode).toBe('ask');
    });

    it('labels draw the select again when it is gone, or when one of its options is', () => {
        setupApproval({ classify, mode: 'ask' }, aparteGlobalConfig);
        const el = mount();
        select(el)!.remove();
        el.labels = { plan: 'Planifier' };
        expect(select(el)).not.toBeNull();
        expect(el.querySelector('aparte-option[value="plan"]')?.textContent).toBe('Planifier');

        el.querySelector('aparte-option[value="auto"]')!.remove();
        el.labels = { auto: 'Automatique' };
        expect(el.querySelector('aparte-option[value="auto"]')?.textContent).toBe('Automatique');
        expect(el.querySelectorAll('aparte-option')).toHaveLength(4);
    });

    it('labels can be replaced for a localised host', () => {
        setupApproval({ classify }, aparteGlobalConfig);
        const el = mount();
        el.labels = { plan: 'Planifier', auto: 'Automatique' };
        const text = [...el.querySelectorAll('aparte-option')].map((o) => o.textContent?.trim());
        expect(text).toEqual(['Planifier', 'Ask', 'Auto-edit', 'Automatique']);
    });

    it('labels handed again, the same or new, leave the open list open and the focus where it was', async () => {
        setupApproval({ classify, mode: 'ask' }, aparteGlobalConfig);
        const el = mount();
        const labels = { plan: 'Planifier' };
        el.labels = labels;
        const sel = el.querySelector('aparte-select') as HTMLElement & { open: boolean };
        const trigger = sel.querySelector<HTMLElement>('.aparte-select-trigger')!;
        trigger.focus();
        sel.open = true;
        expect(sel.open).toBe(true);

        el.labels = labels;
        expect(select(el)).toBe(sel);
        expect(sel.open).toBe(true);
        expect(document.activeElement).toBe(trigger);

        el.labels = { plan: 'Planifier', ask: 'Demander' };
        await Promise.resolve();
        expect(select(el)).toBe(sel);
        expect(sel.open).toBe(true);
        expect([...el.querySelectorAll('aparte-option')].map((o) => o.textContent?.trim())).toEqual(['Planifier', 'Demander', 'Auto-edit', 'Auto']);
        // The trigger shows the current mode's new name.
        expect(trigger.textContent).toContain('Demander');
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
