import {
    createElement,
    forwardRef,
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useSyncExternalStore,
    type ForwardRefExoticComponent,
    type ForwardedRef,
    type HTMLAttributes,
    type PropsWithoutRef,
    type ReactElement,
    type RefAttributes,
} from 'react';
import { applyElementProps, releaseDeferredHydration, type AparteAttrValue } from '@aparte/core';

/*
 * What every generated element component shares: `createAparteElement`, and the types its
 * props are built from. `generated/element-components.ts` is a TABLE — for each element, which
 * attributes, properties and events it has — and this is the one place that knows what to do
 * with a row.
 *
 * Why a component applies its props itself instead of handing them to React:
 *
 *   • React 18 stringifies every prop of a custom element into an attribute and listens to no
 *     event, so a property (`conversations`) is `[object Object]`, an `onXxx` is an unknown
 *     attribute, and `disabled={false}` is `disabled="false"` — which an element that tests
 *     `hasAttribute` reads as ON.
 *   • React 19 sets a prop as a property when the element has one of that name and as an
 *     attribute when it does not, and listens for `on` + the exact event name. Which of the two
 *     a prop becomes depends on the element's class, not on what the prop means.
 *
 * So the component is the same under both: it renders the element with the props that are
 * React's (`className`, `style`, `children`, `id`, `aria-*`, `data-*`, `onClick`…) and, after
 * the render, writes the rest itself — attributes through core's `applyElementProps` (the rule
 * the Angular directives and `<AparteUi>` follow), properties by assignment, events with
 * `addEventListener`.
 */

/** "Am I hydrating?" as a store React reads: its server snapshot is used for the hydration render. The same three lines as `<AparteChat>`'s. */
const subscribeToNothing = () => () => {};
const isHydrating = () => true;
const isNotHydrating = () => false;

/** A layout effect on the client, so props land before the first paint; a plain one on the server, where React 18 warns about the first. */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * One attribute, as a component takes it.
 *
 * The template spelling every raw tag takes — `''` is on, `null` and `undefined` are off, a
 * number is itself or the string it becomes — and two things besides. A boolean: the component
 * writes the attribute itself, so `true` turns a presence attribute on and `false` turns it off,
 * which the raw tag cannot say (React would write `"false"`); an attribute that is ON unless it
 * is the string `"false"` (the composer's `submit-on-enter`) is turned off by `false` the same
 * way, because `applyElementProps` knows which they are. (`null` on any attribute removes it,
 * as `undefined` does: that is `AparteAttrValue`'s, so a raw tag takes it too.)
 */
export type AparteElementAttr<T> = T extends boolean ? boolean | '' | null | undefined : AparteAttrValue<T>;

/** An element's attributes, as a component takes them, by the names the raw tag has. */
export type AparteElementAttrs<A> = { [K in keyof A]?: AparteElementAttr<NonNullable<A[K]>> };

/**
 * What a component takes beside what it declares: the element's attributes, and every
 * standard HTML prop (`className`, `style`, `children`, `id`, `aria-*`, `onClick`…) on the
 * element. The element's own name wins where the two collide, as it does on the raw tag.
 */
export type AparteElementProps<A> = Omit<HTMLAttributes<HTMLElement>, keyof A> & AparteElementAttrs<A>;

/** What the generated file says an element has: the row of the table. */
export interface AparteElementSpec {
    /** The attributes it takes: written with `applyElementProps` when their value changes. */
    readonly attributes: readonly string[];
    /** The members it has only as a property (no attribute): assigned when their value changes. */
    readonly properties: readonly string[];
    /** `[DOM event, the callback prop that receives it]`: listened for once, calling the latest callback. */
    readonly events: readonly (readonly [type: string, prop: string])[];
    /** The attributes the element reads once, at connect: rendered with it, not written after. */
    readonly initial: readonly string[];
}

/**
 * The component for the element `tag`, as `spec` describes it.
 *
 *   - Attributes and properties are written after each render, and only the ones whose value
 *     changed. A rewrite would call `attributeChangedCallback` for nothing, and for a property
 *     like `conversations` would draw every row again. A prop that was never passed is not
 *     written at all; one that goes away after it was is cleared (an attribute is removed, a
 *     property is assigned `undefined`, which the elements that take one read as "none").
 *     An element that changes an attribute itself (a select's `value`) keeps what it did until
 *     the prop next changes: a prop is a write, not a watch.
 *   - Each event is listened for once, for the life of the element, and calls the callback the
 *     latest render passed: `(detail, event)`, where `event.preventDefault()` reaches the
 *     sender. A callback that changes takes no new subscription.
 *   - What the spec calls `initial` is rendered with the element, as the string it is.
 *   - Everything else is React's, on the element: `className` becomes `class`, because React 18
 *     writes `className` on a custom element as an attribute of that name.
 *
 * Call it with `/* @__PURE__ *\/` and keep its result a module-level constant: it is what lets a
 * bundler drop the components an app does not import.
 */
/** Properties given to an element not defined yet, the latest of each, kept for its setters. */
const heldProps = new WeakMap<Element, Map<string, unknown>>();

/**
 * Assign a property, or keep it for the element's setter while its tag is not defined yet: a
 * plugin's spec defines nothing, so its component can mount before the element's module has
 * loaded. Assigned then, the value became the element's OWN property, which shadows the setter
 * the definition brings, for good. Core's `applyElementProps` holds a property the same way; this
 * is that rule for the properties a generated component assigns itself.
 */
function assignWhenDefined(el: Element, name: string, value: unknown): void {
    const tag = el.localName;
    if (!tag.includes('-') || typeof customElements === 'undefined' || customElements.get(tag)) {
        (el as unknown as Record<string, unknown>)[name] = value;
        return;
    }
    let held = heldProps.get(el);
    if (!held) {
        heldProps.set(el, (held = new Map()));
        void customElements.whenDefined(tag).then(() => {
            const props = heldProps.get(el);
            heldProps.delete(el);
            if (!props) return;
            customElements.upgrade?.(el);
            for (const [key, v] of props) {
                delete (el as unknown as Record<string, unknown>)[key];
                (el as unknown as Record<string, unknown>)[key] = v;
            }
        });
    }
    held.set(name, value);
}

export function createAparteElement<El extends HTMLElement, P extends object>(
    tag: string,
    displayName: string,
    spec: AparteElementSpec,
): ForwardRefExoticComponent<PropsWithoutRef<P> & RefAttributes<El>> {
    /** Every prop the component handles, which therefore never reaches React as one. */
    const own = new Set<string>([
        ...spec.attributes,
        ...spec.initial,
        ...spec.properties,
        ...spec.events.map(([, prop]) => prop),
    ]);

    function AparteElement(props: Record<string, unknown>, forwarded: ForwardedRef<El>): ReactElement {
        // True in the server render and in the render that hydrates it, false in every client
        // render after — and from the first one in an app with no server render. While true the
        // element carries `defer-hydration`: core's elements draw themselves the moment they
        // upgrade, which on a server-rendered page is before React hydrates, and React would
        // find a DOM it did not render and throw the server's HTML away (error 418).
        const hydrating = useSyncExternalStore(subscribeToNothing, isNotHydrating, isHydrating);
        const element = useRef<El | null>(null);
        const latest = useRef(props);
        const applied = useRef<Record<string, unknown>>({});

        // One ref for two readers: the effects below, and whoever passed `ref`. The forwarded
        // callback's return is handed back as it is: React 19 calls a cleanup a ref callback
        // returns when the ref is detached, instead of calling it with `null`.
        const setRef = useCallback((el: El | null) => {
            element.current = el;
            if (typeof forwarded === 'function') return forwarded(el);
            if (forwarded) forwarded.current = el;
            return undefined;
        }, [forwarded]);

        // The callbacks, as of this render. First, so that an event an effect below makes the
        // element send already reaches the new one.
        useIsomorphicLayoutEffect(() => {
            latest.current = props;
        });

        // React has the page: let the element draw itself. Before anything talks to it, which is
        // core's rule for a wrapper, and a no-op for an element nothing held (a client render).
        useIsomorphicLayoutEffect(() => {
            releaseDeferredHydration(element.current);
        }, []);

        // The events, once. Before the props are written, so an event they cause is heard.
        useIsomorphicLayoutEffect(() => {
            const el = element.current;
            if (!el) return undefined;
            const offs = spec.events.map(([type, prop]) => {
                const listener = (event: Event): void => {
                    const callback = latest.current[prop];
                    if (typeof callback === 'function') callback((event as CustomEvent).detail, event);
                };
                el.addEventListener(type, listener);
                return () => el.removeEventListener(type, listener);
            });
            return () => {
                for (const off of offs) off();
            };
        }, []);

        // The attributes and properties, when they changed.
        useIsomorphicLayoutEffect(() => {
            const el = element.current;
            if (!el) return;
            const was = applied.current;
            const next: Record<string, unknown> = {};
            const written: Record<string, unknown> = {};
            for (const name of spec.attributes) {
                next[name] = props[name];
                if (!Object.is(props[name], was[name])) written[name] = props[name];
            }
            applyElementProps(el, written);
            for (const name of spec.properties) {
                next[name] = props[name];
                // A prop nobody passed is `undefined` on both sides, so nothing is written; one
                // that goes away after it was set differs, and is assigned `undefined`.
                if (!Object.is(props[name], was[name])) assignWhenDefined(el, name, props[name]);
            }
            applied.current = next;
        });

        const host: Record<string, unknown> = { ref: setRef };
        for (const key of Object.keys(props)) {
            if (!own.has(key)) host[key === 'className' ? 'class' : key] = props[key];
        }
        for (const name of spec.initial) {
            const value = props[name];
            if (value !== undefined && value !== null && value !== false) host[name] = value === true ? '' : String(value);
        }
        if (hydrating) host['defer-hydration'] = '';
        return createElement(tag, host);
    }

    const component = forwardRef<El, P>(AparteElement as never);
    component.displayName = displayName;
    return component;
}
