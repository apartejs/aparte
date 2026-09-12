import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig } from '../aparte-config';
import type { AparteAction, AparteActionZone } from '../action-provider';
import type { AparteActionEventDetail } from '../../types/events';

/**
 * The registry places buttons on the message bubble, and nowhere else. A composer
 * button is an `<aparte-composer-action>` element the consumer writes in markup, so
 * `'composer'`, the `composer` placement block and `setActionHidden` are gone.
 */
describe('The action registry has one zone', () => {
    afterEach(() => aparteGlobalConfig.unregisterAction('one-zone'));

    it('does not take a composer zone', () => {
        const action: AparteAction = {
            id: 'one-zone', label: 'Share', icon: '<svg></svg>',
            // @ts-expect-error a composer button is an <aparte-composer-action> element
            zones: ['composer'],
        };
        expect(action.zones).toHaveLength(1);
    });

    it('does not take a composer placement block', () => {
        const action: AparteAction = {
            id: 'one-zone', label: 'Share', icon: '<svg></svg>', zones: ['bubble'],
            // @ts-expect-error placement in the composer is the markup's, not the registry's
            composer: { position: 'left' },
        };
        expect(action.zones).toEqual(['bubble']);
    });

    it('has no setActionHidden', () => {
        // Never called — it no longer exists. Declared so TypeScript reads the call.
        const toggle = (): void => {
            // @ts-expect-error setActionHidden is removed with the composer zone
            aparteGlobalConfig.setActionHidden('one-zone', true);
        };
        expect(typeof toggle).toBe('function');
        expect('setActionHidden' in aparteGlobalConfig).toBe(false);
    });

    it('reports the same zone in the aparte-action detail', () => {
        const zone: AparteActionZone = 'bubble';
        const detail: AparteActionEventDetail = { actionId: 'one-zone', zone };
        expect(detail.zone).toBe('bubble');

        const stale: AparteActionEventDetail = {
            actionId: 'one-zone',
            // @ts-expect-error the detail carries AparteActionZone, which has no composer member
            zone: 'composer',
        };
        expect(stale.zone).not.toBe(zone);
    });
});
