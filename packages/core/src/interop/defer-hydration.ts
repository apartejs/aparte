/**
 * `defer-hydration`: an aparté element waits while it, or an ancestor, carries the attribute.
 *
 * Core's elements are light DOM and draw themselves when they connect: they add their own
 * children, attributes and styles. On a server-rendered page that runs BEFORE the framework
 * hydrates — importing `@aparte/core` defines them, and defining them upgrades the elements the
 * server sent — so React, Vue, Svelte or Angular then compares its render to a DOM the elements
 * have already changed, finds a mismatch, and throws the server's HTML away (React's error 418,
 * Angular's NG0500).
 *
 * The rule is the one the Web Components Community Group's `defer-hydration` protocol gives an
 * element (Lit's SSR follows it), widened to a subtree: an element connected inside an element
 * that carries `defer-hydration` — or carrying it itself — does nothing; when the attribute is
 * removed, its upgrade is replayed as the browser would have run it: `attributeChangedCallback`
 * for each observed attribute it has, then `connectedCallback`. A wrapper renders the attribute
 * on its root in the server render and in the hydration render, and calls
 * {@link releaseDeferredHydration} once the framework has the page. Removing the attribute any
 * other way releases too, a microtask later.
 */

const ATTR = 'defer-hydration';

interface Callbacks {
    connectedCallback?(): void;
    disconnectedCallback?(): void;
    attributeChangedCallback?(name: string, oldValue: string | null, newValue: string | null): void;
}

/** Holder → the elements it holds, in the order they would have upgraded. */
const waiting = new WeakMap<Element, HTMLElement[]>();
/** Element → the holder it waits on. */
const holderOf = new WeakMap<HTMLElement, Element>();
/** Elements whose callbacks were skipped: their first real connection replays the attributes. */
const pending = new WeakSet<HTMLElement>();
/**
 * Elements connected for real and not disconnected since. Never held: an ancestor that gains the
 * attribute after they connected — Angular's host binding in a client-only render — must not
 * drop their attribute changes, nor have the release connect them a second time.
 */
const live = new WeakSet<HTMLElement>();
const observers = new WeakMap<Element, MutationObserver>();
const patched = new WeakSet<object>();

/** True when `el` must wait — and it is then recorded, to be connected on release. */
function isHeld(el: HTMLElement): boolean {
    if (live.has(el)) return false;
    if (holderOf.has(el)) return true;
    const holder = el.closest(`[${ATTR}]`);
    if (!holder) return false;
    holderOf.set(el, holder);
    let list = waiting.get(holder);
    if (!list) {
        list = [];
        waiting.set(holder, list);
        const observer = new MutationObserver(() => {
            if (!holder.hasAttribute(ATTR)) release(holder);
        });
        observer.observe(holder, { attributes: true, attributeFilter: [ATTR] });
        observers.set(holder, observer);
    }
    list.push(el);
    return true;
}

function release(holder: Element): void {
    observers.get(holder)?.disconnect();
    observers.delete(holder);
    const list = waiting.get(holder) ?? [];
    waiting.delete(holder);
    for (const el of list) {
        holderOf.delete(el);
        // Connected through the patched callback: it replays the attributes first, and an
        // element moved under another holder in the meantime is held by that one instead.
        // One an earlier element of this release moved and so connected already is skipped.
        if (el.isConnected && !live.has(el)) (el as HTMLElement & Callbacks).connectedCallback?.();
    }
}

/**
 * Release `root` — remove its `defer-hydration` attribute and upgrade, synchronously, every
 * aparté element it held. A wrapper calls it once the framework has hydrated, before anything
 * talks to the elements. A root that carries no attribute is left as it is.
 */
export function releaseDeferredHydration(root: Element | null | undefined): void {
    if (!root || !root.hasAttribute(ATTR)) return;
    root.removeAttribute(ATTR);
    release(root);
}

/**
 * Make an element class honour `defer-hydration`. Core's own elements call it before they are
 * defined; an element of a plugin, or of yours, that draws itself on connect can too — call it
 * before `customElements.define`, since defining upgrades the elements already in the page.
 */
export function deferHydrationOf(ctor: CustomElementConstructor): void {
    if (patched.has(ctor)) return;
    patched.add(ctor);
    const proto = ctor.prototype as Callbacks;
    const connected = proto.connectedCallback;
    const changed = proto.attributeChangedCallback;
    const disconnected = proto.disconnectedCallback;
    const observed = (ctor as unknown as { observedAttributes?: readonly string[] }).observedAttributes ?? [];

    proto.connectedCallback = function (this: HTMLElement) {
        if (isHeld(this)) { pending.add(this); return; }
        if (pending.has(this)) {
            // The upgrade the browser would have run, in its order: the observed attributes it
            // has, then the connection.
            pending.delete(this);
            for (const name of observed) {
                const value = this.getAttribute(name);
                if (value !== null) changed?.call(this, name, null, value);
            }
        }
        live.add(this);
        connected?.call(this);
    };
    if (changed) {
        proto.attributeChangedCallback = function (this: HTMLElement, name: string, oldValue: string | null, newValue: string | null) {
            if (isHeld(this)) { pending.add(this); return; }
            changed.call(this, name, oldValue, newValue);
        };
    }
    proto.disconnectedCallback = function (this: HTMLElement) {
        const holder = holderOf.get(this);
        if (holder) {
            // Never connected for real: nothing to tear down. It stays pending, so a later
            // connection outside any holder still replays its attributes.
            holderOf.delete(this);
            const list = waiting.get(holder);
            if (list) list.splice(list.indexOf(this), 1);
            return;
        }
        if (pending.has(this)) return;
        live.delete(this);
        disconnected?.call(this);
    };
}
