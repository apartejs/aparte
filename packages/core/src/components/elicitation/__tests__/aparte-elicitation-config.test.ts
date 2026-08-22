/**
 * The presenter must reach the config the chat actually uses, whatever the mount
 * order — because under every wrapper the order is the bad one.
 *
 * All four wrappers call `AparteChatHost.bind()` (which runs `attachConfig`) from
 * a POST-mount hook: React `useEffect`, Vue `onMounted`, Svelte `onMount`, Angular
 * `ngAfterViewInit`. So `<aparte-elicitation>` connects, registers itself on
 * whatever it can resolve — the global singleton — and only afterwards does the
 * instance boundary appear above it.
 *
 * The consequence was silent and it lied to the model: `requestUserInput()`
 * resolved the instance config, found no presenter, and returned
 * `{ action: 'cancel' }`. The model read that as the user declining a question
 * the user was never shown.
 *
 * Reading live cannot fix this, which is why the earlier sweep missed it. The
 * registration is a WRITE: it already happened, into the wrong object.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AparteConfig, aparteGlobalConfig } from '../../../config/aparte-config.js';
import { attachConfig, detachConfig } from '../../../config/config-context.js';
import '../aparte-elicitation.js';

describe('<aparte-elicitation> and the instance config', () => {
    let host: HTMLElement;

    beforeEach(() => {
        aparteGlobalConfig.setElicitationPresenter(null);
        host = document.createElement('div');
        document.body.appendChild(host);
    });

    afterEach(() => {
        host.remove();
        aparteGlobalConfig.setElicitationPresenter(null);
    });

    it('reaches the instance config when the boundary is attached AFTER mount (every wrapper)', () => {
        // The wrapper order: children connect first...
        host.innerHTML = '<aparte-elicitation></aparte-elicitation>';
        // ...then bind() attaches the boundary.
        const instance = new AparteConfig();
        attachConfig(host, instance);

        expect(instance.getElicitationPresenter(), 'the chat that will be asked must have the presenter').toBeTruthy();
    });

    it('still works when the boundary is attached BEFORE mount', () => {
        const instance = new AparteConfig();
        attachConfig(host, instance);
        host.innerHTML = '<aparte-elicitation></aparte-elicitation>';

        expect(instance.getElicitationPresenter()).toBeTruthy();
    });

    it('leaves the global singleton alone once it belongs to an instance', () => {
        host.innerHTML = '<aparte-elicitation></aparte-elicitation>';
        const instance = new AparteConfig();
        attachConfig(host, instance);

        // `setElicitationPresenter(null)` normalises to `undefined` — that is the
        // declared cleared value, pinned here rather than assumed.
        expect(aparteGlobalConfig.getElicitationPresenter(), 'the global must not keep a presenter that moved').toBeUndefined();
    });

    it('two chats each get their own presenter, not one shared through the global', () => {
        const a = document.createElement('div');
        const b = document.createElement('div');
        document.body.appendChild(a);
        document.body.appendChild(b);
        a.innerHTML = '<aparte-elicitation></aparte-elicitation>';
        b.innerHTML = '<aparte-elicitation></aparte-elicitation>';

        const cfgA = new AparteConfig();
        const cfgB = new AparteConfig();
        attachConfig(a, cfgA);
        attachConfig(b, cfgB);

        const pA = cfgA.getElicitationPresenter();
        const pB = cfgB.getElicitationPresenter();
        expect(pA).toBeTruthy();
        expect(pB).toBeTruthy();
        expect(pA, 'each chat presents through its OWN element').not.toBe(pB);

        a.remove();
        b.remove();
    });

    it('releases the instance config on detach, so a removed element is not held forever', () => {
        host.innerHTML = '<aparte-elicitation></aparte-elicitation>';
        const instance = new AparteConfig();
        attachConfig(host, instance);
        expect(instance.getElicitationPresenter()).toBeTruthy();

        // The wrappers' teardown order: unbind() detaches, THEN the framework
        // removes the DOM. The element's own disconnectedCallback therefore runs
        // too late to find the config it registered on.
        detachConfig(host);
        expect(instance.getElicitationPresenter(), 'the instance config must not hold a detached element').toBeUndefined();
    });
});
