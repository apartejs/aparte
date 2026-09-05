// @vitest-environment jsdom
/**
 * Under `framework-managed` the viewport draws no skeleton: the host IS the scroll
 * surface and its children are the wrapper's — React, Vue and Svelte reconcile them,
 * and a `<div>` core prepends there is a child they did not render. The attribute and
 * `aria-busy` still say the transcript is on its way; what it looks like is the
 * wrapper's to draw, from its own `loading` state.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../aparte-chat-viewport.js';

describe('aparte-chat-viewport[framework-managed] loading', () => {
    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { document.body.innerHTML = ''; });

    it('marks the host aria-busy and draws nothing inside it', () => {
        const vp = document.createElement('aparte-chat-viewport');
        vp.setAttribute('framework-managed', '');
        document.body.appendChild(vp);
        vp.setAttribute('loading', '');
        expect(vp.getAttribute('aria-busy')).toBe('true');
        expect(vp.querySelector('.aparte-viewport-loading')).toBeNull();
        vp.removeAttribute('loading');
        expect(vp.getAttribute('aria-busy')).toBe('false');
    });
});
