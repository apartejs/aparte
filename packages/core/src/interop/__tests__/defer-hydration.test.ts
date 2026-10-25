/**
 * `defer-hydration`: what a server-rendered page needs from core's elements — that they leave
 * the server's DOM alone until the framework has hydrated it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../../components/composer/aparte-composer-send.js';
import { deferHydrationOf, releaseDeferredHydration } from '../defer-hydration.js';

const log: string[] = [];

class HeldProbe extends HTMLElement {
    static observedAttributes = ['label'];
    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
        log.push(`attr ${name} ${oldValue} → ${newValue}`);
    }
    connectedCallback() {
        log.push('connected');
        this.append(document.createElement('span'));
    }
    disconnectedCallback() { log.push('disconnected'); }
}
deferHydrationOf(HeldProbe);
customElements.define('held-probe', HeldProbe);

/** A holder with server-rendered markup in it, as the browser would parse it. */
function serverRendered(html: string, attr = true): HTMLElement {
    const holder = document.createElement('div');
    if (attr) holder.setAttribute('defer-hydration', '');
    holder.innerHTML = html;
    document.body.append(holder);
    return holder;
}

describe('defer-hydration', () => {
    afterEach(() => {
        document.body.replaceChildren();
        log.length = 0;
    });

    it('an element inside a holder does nothing until released', () => {
        const holder = serverRendered('<held-probe label="Hi"></held-probe>');
        const probe = holder.querySelector('held-probe')!;
        expect(log).toEqual([]);
        expect(probe.children).toHaveLength(0);
        releaseDeferredHydration(holder);
        expect(holder.hasAttribute('defer-hydration')).toBe(false);
        // The upgrade the browser would have run: the attribute, then the connection.
        expect(log).toEqual(['attr label null → Hi', 'connected']);
        expect(probe.children).toHaveLength(1);
    });

    it('a core element leaves the server markup alone until released', () => {
        const holder = serverRendered('<aparte-composer-send></aparte-composer-send>');
        const send = holder.querySelector('aparte-composer-send')!;
        expect(send.innerHTML).toBe('');
        releaseDeferredHydration(holder);
        expect(send.querySelector('button')).not.toBeNull();
    });

    it('releases on the attribute leaving by any other way, a microtask later', async () => {
        const holder = serverRendered('<held-probe></held-probe>');
        holder.removeAttribute('defer-hydration');
        expect(log).toEqual([]);
        await Promise.resolve();
        await Promise.resolve();
        expect(log).toEqual(['connected']);
    });

    it('an element carrying the attribute itself waits for its own release', () => {
        const holder = serverRendered('<held-probe defer-hydration label="x"></held-probe>', false);
        const probe = holder.querySelector('held-probe')!;
        expect(log).toEqual([]);
        releaseDeferredHydration(probe);
        expect(log).toEqual(['attr label null → x', 'connected']);
    });

    it('an element removed while held is never torn down, and replays its attributes when it connects later', () => {
        const holder = serverRendered('<held-probe label="a"></held-probe>');
        const probe = holder.querySelector('held-probe')!;
        probe.remove();
        expect(log).toEqual([]);
        releaseDeferredHydration(holder);
        expect(log).toEqual([]);
        document.body.append(probe);
        expect(log).toEqual(['attr label null → a', 'connected']);
    });

    it('outside any holder nothing changes', () => {
        serverRendered('<held-probe label="b"></held-probe>', false);
        expect(log).toEqual(['attr label null → b', 'connected']);
        releaseDeferredHydration(document.body);
        expect(log).toEqual(['attr label null → b', 'connected']);
    });

    it('an element already live is never held by an ancestor that gains the attribute later', () => {
        // Angular in a client-only render: the template's elements connect, then the host
        // binding puts defer-hydration on the host, then the child bindings write attributes.
        const parent = document.createElement('div');
        parent.innerHTML = '<held-probe label="a"></held-probe>';
        document.body.append(parent);
        expect(log).toEqual(['attr label null → a', 'connected']);
        parent.setAttribute('defer-hydration', '');
        parent.querySelector('held-probe')!.setAttribute('label', 'b');
        expect(log).toEqual(['attr label null → a', 'connected', 'attr label a → b']);
        releaseDeferredHydration(parent);
        // Not connected a second time: its observers and listeners would leak.
        expect(log.filter((l) => l === 'connected')).toHaveLength(1);
        parent.remove();
        expect(log.filter((l) => l === 'disconnected')).toHaveLength(1);
    });

    it('a held element another one moves and connects during the release is not connected twice', () => {
        class MovingProbe extends HTMLElement {
            connectedCallback() {
                // Like the viewport's own render: it takes its children into a wrapper of its own.
                const wrapper = document.createElement('div');
                while (this.firstChild) wrapper.appendChild(this.firstChild);
                this.append(wrapper);
            }
        }
        deferHydrationOf(MovingProbe);
        customElements.define('moving-probe', MovingProbe);
        const holder = serverRendered('<moving-probe><held-probe></held-probe></moving-probe>');
        releaseDeferredHydration(holder);
        expect(log.filter((l) => l === 'connected')).toHaveLength(1);
    });

    it('nested holders: the inner release leaves the element held by the outer one', () => {
        const outer = serverRendered('<div defer-hydration id="inner"><held-probe></held-probe></div>');
        const inner = outer.querySelector('#inner')!;
        releaseDeferredHydration(inner);
        expect(log).toEqual([]);
        releaseDeferredHydration(outer);
        expect(log).toEqual(['connected']);
    });
});
