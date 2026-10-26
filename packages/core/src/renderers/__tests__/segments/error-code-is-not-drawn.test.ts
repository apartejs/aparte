// @vitest-environment jsdom
/**
 * An error's CODE is for the app, not for the person.
 *
 * A failed turn carried its `AparteErrorCode` in `details`, and the alert drew `details`
 * in a block under the message — so the person read `UNKNOWN_ERROR` or
 * `MAX_TURNS_EXCEEDED` under a sentence that already said what happened. The code lives
 * in its own field now: stamped on the alert as `data-error-code` for CSS and tests,
 * handed to a custom error renderer, never drawn. `details` stays what it says, for text
 * an app chooses to show.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { getSegmentRenderer, registerDefaultRenderers } from '../../segment-renderers.js';
import { aparteGlobalConfig, AparteConfig } from '../../../config/index.js';
import { createStreamAdapter } from '../../../client/stream-adapter.js';
import type { AparteSegment, AparteErrorSegment } from '../../../types/index.js';
import { AparteErrorCode } from '../../../types/errors.js';

registerDefaultRenderers();

function draw(segment: AparteErrorSegment): HTMLElement {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(getSegmentRenderer('error')!.render(segment)).trim();
    return tpl.content.firstElementChild as HTMLElement;
}

afterEach(() => aparteGlobalConfig.setErrorRenderer(null));

describe('an error code', () => {
    it('is stamped on the alert and not drawn', () => {
        const el = draw({ id: 'e1', type: 'error', content: 'The provider refused the request.', code: 'PROVIDER_ERROR' } as AparteErrorSegment);
        expect(el.getAttribute('data-error-code')).toBe('PROVIDER_ERROR');
        expect(el.textContent).not.toContain('PROVIDER_ERROR');
        expect(el.querySelector('.aparte-segment-error__details')).toBeNull();
    });

    it('reaches a custom error renderer beside the message', () => {
        let seen: unknown;
        aparteGlobalConfig.setErrorRenderer((ctx) => { seen = ctx; return '<div class="mine"></div>'; });
        draw({ id: 'e2', type: 'error', content: 'Boom.', code: 'UNKNOWN_ERROR' } as AparteErrorSegment);
        expect(seen).toEqual({ message: 'Boom.', sentence: 'The assistant couldn’t answer this request.', code: 'UNKNOWN_ERROR' });
    });

    it('the turn limit carries its code, not as details', () => {
        const added: AparteSegment[] = [];
        const emit = createStreamAdapter({
            target: { addSegment: (s: AparteSegment) => { added.push(s); }, updateSegment: () => {}, updateMessage: () => {}, dispatchEvent: () => true },
            config: new AparteConfig(),
            messageId: 'm1',
        });
        emit({ type: 'turn-limit-exceeded', scope: 'global', limit: 2 });
        const error = added.find((s) => s.type === 'error') as AparteErrorSegment;
        expect(error.code).toBe('MAX_TURNS_EXCEEDED');
        // A code an app can branch on through the enum, not a string it has to know.
        expect(error.code).toBe(AparteErrorCode.MAX_TURNS_EXCEEDED);
        expect(error.details).toBeUndefined();
    });
});
