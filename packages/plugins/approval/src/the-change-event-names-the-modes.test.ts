/**
 * `aparte-approval-mode-change` from this plugin carries one of its four modes, and its type says so.
 *
 * The switch and the command menu only ever send `plan`, `ask`, `auto-edit` or `auto`, but the
 * element's spec typed the detail as core's `AparteApprovalModeChangeEventDetail`, whose `mode`
 * is a `string` (core names no mode). So `createAparteElement(approvalModeElement)` called
 * `onApprovalModeChange` with a `string`, and a `Record<ApprovalMode, …>` lookup took a guard or a
 * cast. The detail is the plugin's own `ApprovalModeChangeDetail` now, which still satisfies
 * core's type for a listener on the event map.
 *
 * Types only: the assertions are checked by `tsc` (`typecheck:tests`); `expectTypeOf` is a no-op
 * under vitest.
 */
import { describe, it, expectTypeOf } from 'vitest';
import type { AparteApprovalModeChangeEventDetail, AparteSpecEvents } from '@aparte/core';
import type { ApprovalMode, ApprovalModeChangeDetail, approvalModeElement } from './index.js';

/** What a wrapper hands its callback: `onApprovalModeChange(detail)` in React reads exactly this. */
type DetailOf<E> = E extends { readonly detail: infer D } ? D : never;
type SpecDetail = DetailOf<AparteSpecEvents<typeof approvalModeElement>['aparte-approval-mode-change']>;

describe('the approval mode change detail', () => {
    it('is the plugin\'s own type in the element\'s spec', () => {
        expectTypeOf<SpecDetail>().toEqualTypeOf<ApprovalModeChangeDetail>();
    });

    it('names a mode and the one it replaced as `ApprovalMode`', () => {
        expectTypeOf<ApprovalModeChangeDetail['mode']>().toEqualTypeOf<ApprovalMode>();
        expectTypeOf<ApprovalModeChangeDetail['previousMode']>().toEqualTypeOf<ApprovalMode>();
        const names: Record<ApprovalMode, string> = { plan: 'Plan', ask: 'Ask', 'auto-edit': 'Edits', auto: 'Auto' };
        const read = (detail: SpecDetail): string => names[detail.mode];
        expectTypeOf(read).returns.toEqualTypeOf<string>();
    });

    it('still satisfies core\'s detail, so a listener on the event map reads it', () => {
        expectTypeOf<ApprovalModeChangeDetail>().toMatchTypeOf<AparteApprovalModeChangeEventDetail>();
    });
});
