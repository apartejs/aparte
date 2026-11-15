// @vitest-environment jsdom
/**
 * An approval can carry what the call would DO, drawn — a diff for an edit — between the
 * arguments and the options.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { buildApprovalPanel } from '../approval-panel.js';
import { aparteGlobalConfig } from '../../config/aparte-config.js';

const OPTIONS = [
    { value: 'allow', label: 'Approve', tone: 'affirm' as const },
    { value: 'deny', label: 'Reject', tone: 'deny' as const },
];
const NOOP = (): void => { /* onChange */ };

afterEach(() => { aparteGlobalConfig.reset(); document.body.innerHTML = ''; });

const order = (panel: { el: HTMLElement }): string[] =>
    [...panel.el.querySelectorAll('.aparte-elic-message, .aparte-approval-args, .aparte-approval-preview, .aparte-approval-options')]
        .map((n) => n.className.split(' ').find((c) => /message|args|preview|options/.test(c))!);

describe('buildApprovalPanel preview', () => {
    it('mounts an element between the arguments and the options, as it is', () => {
        const mine = document.createElement('div');
        mine.className = 'my-diff';
        const panel = buildApprovalPanel('Edit a.ts?', OPTIONS, NOOP, '{"a":1}', true, mine);
        expect(panel.el.querySelector('.aparte-approval-preview > .my-diff')).toBe(mine);
        expect(order(panel)).toEqual(['aparte-elic-message', 'aparte-approval-args', 'aparte-approval-preview', 'aparte-approval-options']);
    });

    it('a string goes through the sanitizer', () => {
        aparteGlobalConfig.setHtmlSanitizer((html) => html.replace(/<script.*?<\/script>/g, ''));
        const panel = buildApprovalPanel('Edit?', OPTIONS, NOOP, undefined, true, '<b>x</b><script>bad()</script>');
        expect(panel.el.querySelector('.aparte-approval-preview b')?.textContent).toBe('x');
        expect(panel.el.querySelector('.aparte-approval-preview script')).toBeNull();
    });

    it('draws nothing for an empty preview', () => {
        expect(buildApprovalPanel('?', OPTIONS, NOOP, undefined, true, '').el.querySelector('.aparte-approval-preview')).toBeNull();
        expect(buildApprovalPanel('?', OPTIONS, NOOP).el.querySelector('.aparte-approval-preview')).toBeNull();
    });
});
