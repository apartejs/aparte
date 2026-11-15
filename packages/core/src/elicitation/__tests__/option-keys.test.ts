// @vitest-environment jsdom
/**
 * 1-9 press the n-th option of a panel drawn as buttons, Escape is Skip (question) or the
 * one refusal (approval) — and none of it while the person is typing.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildApprovalPanel } from '../approval-panel.js';
import { buildElicitationPanel } from '../panel.js';
import { bindOptionKeys, numberOptions } from '../option-keys.js';
import { aparteGlobalConfig } from '../../config/aparte-config.js';

afterEach(() => { aparteGlobalConfig.reset(); document.body.innerHTML = ''; });

const NOOP = (): void => { /* onChange */ };
const key = (target: Element, init: KeyboardEventInit): KeyboardEvent => {
    const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(e);
    return e;
};

function approval(options = [
    { value: 'allow', label: 'Approve' },
    { value: 'allow-always', label: 'Always' },
    { value: 'deny', label: 'Reject', tone: 'deny' as const },
]) {
    const panel = buildApprovalPanel('Run it?', options, NOOP);
    const settled = vi.fn();
    panel.onSettle(settled);
    document.body.appendChild(panel.el);
    numberOptions(panel.el);
    bindOptionKeys(panel.el);
    return { panel, settled, buttons: [...panel.el.querySelectorAll<HTMLButtonElement>('.aparte-approval-option')] };
}

describe('options of an approval', () => {
    it('are numbered, visibly and for assistive technology', () => {
        const { buttons } = approval();
        expect(buttons.map((b) => b.dataset.shortcut)).toEqual(['1', '2', '3']);
        expect(buttons.map((b) => b.getAttribute('aria-keyshortcuts'))).toEqual(['1', '2', '3']);
        // The number is drawn by CSS, so the option's text stays its label.
        expect(buttons[0]!.textContent).toBe('Approve');
    });

    it('a digit pressed on an option chooses the n-th one', () => {
        const { buttons, settled } = approval();
        const e = key(buttons[0]!, { key: '2' });
        expect(settled).toHaveBeenCalledWith({ option: 'allow-always' });
        expect(e.defaultPrevented).toBe(true);
    });

    it('a digit does nothing while the panel itself has the focus (the person is typing)', () => {
        const { panel, settled } = approval();
        key(panel.el, { key: '2' });
        expect(settled).not.toHaveBeenCalled();
    });

    it('a digit in the instruction field stays text', () => {
        const { panel, settled } = approval();
        const e = key(panel.el.querySelector('textarea')!, { key: '2' });
        expect(settled).not.toHaveBeenCalled();
        expect(e.defaultPrevented).toBe(false);
    });

    it('ignores a repeat, a modifier and a composition', () => {
        const { buttons, settled } = approval();
        key(buttons[0]!, { key: '1', repeat: true });
        key(buttons[0]!, { key: '1', ctrlKey: true });
        key(buttons[0]!, { key: '1', metaKey: true });
        key(buttons[0]!, { key: '1', isComposing: true });
        expect(settled).not.toHaveBeenCalled();
    });

    it('a digit with no such option does nothing', () => {
        const { buttons, settled } = approval();
        const e = key(buttons[0]!, { key: '7' });
        expect(settled).not.toHaveBeenCalled();
        expect(e.defaultPrevented).toBe(false);
    });

    it('Escape picks the one refusal, and is kept from the launcher', () => {
        const { buttons, settled } = approval();
        const e = key(buttons[0]!, { key: 'Escape' });
        expect(settled).toHaveBeenCalledWith({ option: 'deny' });
        expect(e.defaultPrevented).toBe(true);
    });

    it('Escape does nothing when two options refuse (or none)', () => {
        const two = approval([
            { value: 'a', label: 'A' },
            { value: 'd1', label: 'No', tone: 'deny' },
            { value: 'd2', label: 'Never', tone: 'deny' },
        ]);
        const e = key(two.buttons[0]!, { key: 'Escape' });
        expect(two.settled).not.toHaveBeenCalled();
        expect(e.defaultPrevented).toBe(false);
        document.body.innerHTML = '';
        const none = approval([{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]);
        key(none.buttons[0]!, { key: 'Escape' });
        expect(none.settled).not.toHaveBeenCalled();
    });

    it('Escape in the instruction field is left to the field', () => {
        const { panel, settled } = approval();
        key(panel.el.querySelector('textarea')!, { key: 'Escape' });
        expect(settled).not.toHaveBeenCalled();
    });
});

describe('options of a single-choice question', () => {
    function question() {
        const settled = vi.fn();
        const panel = buildElicitationPanel('Which?', {
            type: 'enum', options: [{ value: 'red' }, { value: 'green' }], allowOther: true,
        } as never, NOOP);
        panel.onSettle(settled);
        const skip = document.createElement('button');
        skip.className = 'aparte-btn aparte-elic-skip';
        const declined = vi.fn();
        skip.addEventListener('click', declined);
        panel.dismiss.appendChild(skip);
        document.body.appendChild(panel.el);
        numberOptions(panel.el);
        bindOptionKeys(panel.el);
        return { panel, settled, declined, buttons: [...panel.el.querySelectorAll<HTMLButtonElement>('.aparte-elic-option--command')] };
    }

    it('digits choose, Escape skips', () => {
        const { buttons, settled, declined } = question();
        expect(buttons.length).toBeGreaterThanOrEqual(2);
        expect(buttons[1]!.dataset.shortcut).toBe('2');
        key(buttons[0]!, { key: '2' });
        expect(settled).toHaveBeenCalledWith('green');
        const e = key(buttons[0]!, { key: 'Escape' });
        expect(declined).toHaveBeenCalled();
        expect(e.defaultPrevented).toBe(true);
    });

    it('stay out of the Other field', () => {
        const { panel, settled, declined } = question();
        const other = panel.el.querySelector<HTMLInputElement>('.aparte-elic-other-input');
        expect(other).not.toBeNull();
        key(other!, { key: '1' });
        key(other!, { key: 'Escape' });
        expect(settled).not.toHaveBeenCalled();
        expect(declined).not.toHaveBeenCalled();
    });
});
