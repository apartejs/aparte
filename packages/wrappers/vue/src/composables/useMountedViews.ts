import { onBeforeUnmount, onMounted, shallowRef, watch, type ShallowRef, type WatchSource } from 'vue';
import type { AparteMountedView } from '@aparte/core';

/** One element core handed a declaration: where to teleport, what to draw, and a stable key. */
export interface MountedEntry<V> {
    host: HTMLElement;
    view: V;
    key: number;
}

type Mount<V> = (host: HTMLElement, view: V) => AparteMountedView<V>;

/**
 * The elements core hands one `<AparteToolUI>` / `<AparteSegmentUI>`, as a list the template
 * teleports into.
 *
 * `register` is called in the browser only (`onMounted` never runs in a server render), again
 * whenever `source` changes, and its restore function on unmount — so a declaration lives
 * exactly as long as the component, and a server render declares nothing.
 */
export function useMountedViews<V>(
    source: WatchSource<unknown>,
    register: (mount: Mount<V>) => () => void,
): ShallowRef<readonly MountedEntry<V>[]> {
    const entries = shallowRef<readonly MountedEntry<V>[]>([]);
    // A key per element, not the call's id: a model can issue `call_0` on every turn.
    let serial = 0;

    const mount: Mount<V> = (host, view) => {
        const key = ++serial;
        entries.value = [...entries.value, { host, view, key }];
        return {
            update: (next) => {
                entries.value = entries.value.map((e) => (e.host === host ? { host, view: next, key: e.key } : e));
            },
            destroy: () => {
                entries.value = entries.value.filter((e) => e.host !== host);
            },
        };
    };

    let restore: (() => void) | null = null;
    onMounted(() => {
        watch(source, () => { restore?.(); restore = register(mount); }, { immediate: true });
    });
    onBeforeUnmount(() => { restore?.(); restore = null; });

    return entries;
}
