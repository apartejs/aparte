/**
 * Your own React component in a tool call, or in a segment of a type of your own.
 *
 * `<AparteToolUI name="get_weather">{(tool) => <WeatherCard … />}</AparteToolUI>` draws every
 * `get_weather` call with your component for as long as the declaration is mounted, and gives
 * the calls back to core's row when it unmounts. The card is a portal: it renders from where
 * the declaration sits in your tree, so it reads your contexts (a theme, a router, a store) like
 * any other component there.
 *
 * Underneath it is core's `overrideToolRenderer` + `defineMountedToolRenderer`: core hands each
 * matching call an element and every newer state of the call; this component keeps the elements
 * in a small store React reads, and portals the children into each one. Nothing registers on
 * the server, so a server render draws nothing here, and the calls are drawn in the browser.
 */
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
    aparteGlobalConfig,
    defineMountedSegmentRenderer,
    defineMountedToolRenderer,
    overrideSegmentRenderer,
    type AparteConfig,
    type AparteMountedView,
    type AparteSegmentBase,
    type AparteToolCallView,
    type AparteToolMatcher,
} from '@aparte/core';

const NONE: ReadonlyMap<HTMLElement, never> = new Map<HTMLElement, never>();
const serverSnapshot = () => NONE;

/** The elements core handed one declaration, each with the latest state it was given. */
class MountedViews<V> {
    private readonly views = new Map<HTMLElement, V>();
    private snapshot: ReadonlyMap<HTMLElement, V> = NONE;
    private readonly listeners = new Set<() => void>();
    private queued = false;
    // A key per element, not the call's id: a model can issue `call_0` on every turn.
    private readonly keys = new WeakMap<HTMLElement, string>();
    private serial = 0;

    readonly subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };

    readonly getSnapshot = () => this.snapshot;

    readonly keyOf = (host: HTMLElement) => this.keys.get(host);

    readonly mount = (host: HTMLElement, view: V): AparteMountedView<V> => {
        this.keys.set(host, String(++this.serial));
        this.views.set(host, view);
        this.changed();
        return {
            update: (next) => { this.views.set(host, next); this.changed(); },
            destroy: () => { if (this.views.delete(host)) this.changed(); },
        };
    };

    // Core mounts from its own rendering, which can run inside another component's commit
    // (the chat's effects append the bubbles). React hears about it in a microtask, once for
    // however many calls changed together.
    private changed() {
        if (this.queued) return;
        this.queued = true;
        queueMicrotask(() => {
            this.queued = false;
            this.snapshot = new Map(this.views);
            for (const listener of this.listeners) listener();
        });
    }
}

/** A matcher as an effect dependency: a `RegExp` literal is a new object on every render. */
const matcherKey = (match: AparteToolMatcher) => (typeof match === 'string' ? match : String(match));

export interface AparteToolUIProps<I = unknown, R = unknown> {
    /** The tool this draws: a name, a `RegExp`, or `'*'` for every tool. */
    name: AparteToolMatcher;
    /** The config to declare it on. Defaults to the global one. */
    config?: AparteConfig;
    /** What to draw for one call: its id, name, input, status, result and the rest. */
    children: (tool: AparteToolCallView<I, R>) => React.ReactNode;
}

/**
 * Draw a tool call with your own component, for as long as this is mounted.
 *
 * @example
 * <AparteToolUI<{ city: string }> name="get_weather">
 *   {(tool) => <WeatherCard city={tool.input.city} status={tool.status} />}
 * </AparteToolUI>
 */
export function AparteToolUI<I = unknown, R = unknown>({ name, config, children }: AparteToolUIProps<I, R>) {
    const [views] = useState(() => new MountedViews<AparteToolCallView>());
    const key = matcherKey(name);
    useEffect(
        () => (config ?? aparteGlobalConfig).overrideToolRenderer(name, defineMountedToolRenderer(views.mount)),
        // `name` is read through its key: the same pattern written again is the same declaration.
        [key, config, views],
    );
    const mounted = useSyncExternalStore(views.subscribe, views.getSnapshot, serverSnapshot);
    return <>{Array.from(mounted, ([host, view]) => createPortal(children(view as AparteToolCallView<I, R>), host, views.keyOf(host)))}</>;
}

export interface AparteSegmentUIProps<T extends AparteSegmentBase> {
    /** The segment `type` this draws — one your stream emits, or a built-in such as `code`. */
    type: T['type'];
    /** The config to declare it on. Defaults to the global one. */
    config?: AparteConfig;
    /** What to draw for one segment, handed its latest state. */
    children: (segment: T) => React.ReactNode;
}

/**
 * Draw a segment type with your own component, for as long as this is mounted. Taking the
 * last declaration off a built-in type gives it back to core's renderer.
 */
export function AparteSegmentUI<T extends AparteSegmentBase>({ type, config, children }: AparteSegmentUIProps<T>) {
    const [views] = useState(() => new MountedViews<T>());
    useEffect(() => {
        const renderer = defineMountedSegmentRenderer<T>(type, views.mount);
        return config ? overrideSegmentRenderer(renderer, config) : overrideSegmentRenderer(renderer);
    }, [type, config, views]);
    const mounted = useSyncExternalStore(views.subscribe, views.getSnapshot, serverSnapshot);
    return <>{Array.from(mounted, ([host, segment]) => createPortal(children(segment), host, views.keyOf(host)))}</>;
}
