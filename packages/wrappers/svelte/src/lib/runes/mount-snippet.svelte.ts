import { mount, unmount, type Snippet } from 'svelte';
import type { AparteMountedView } from '@aparte/core';
import SnippetHost from './SnippetHost.svelte';

/**
 * Mount `snippet` into `host`, with the contexts of the component that declared it.
 *
 * The value is raw state behind a getter, so `update` re-renders the mounted snippet in place
 * (its components keep their state) and the view object is never wrapped in a proxy.
 */
export function mountSnippet<V>(
    host: HTMLElement,
    snippet: () => Snippet<[V]>,
    view: V,
    context: Map<unknown, unknown>,
): AparteMountedView<V> {
    let value = $state.raw(view);
    const instance = mount(SnippetHost, {
        target: host,
        props: {
            // `mount` cannot carry the host's type parameter: it sees `Snippet<[unknown]>`.
            get snippet() { return snippet() as Snippet<[unknown]>; },
            get value() { return value; },
        },
        context,
    });
    return {
        update: (next) => { value = next; },
        destroy: () => { void unmount(instance); },
    };
}
