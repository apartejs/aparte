<script setup lang="ts" generic="T extends AparteSegmentBase">
/**
 * Your own Vue component for a segment type — one your stream emits, or a built-in such as
 * `code`. Teleported into each segment like `<AparteToolUI>`; taking the last declaration off
 * a built-in type gives it back to core's renderer.
 */
import { defineMountedSegmentRenderer, overrideSegmentRenderer } from '@aparte/core';
import type { AparteConfig, AparteSegmentBase } from '@aparte/core';
import { useMountedViews } from '../composables/useMountedViews.js';

const props = defineProps<{
    /** The segment `type` this draws. */
    type: T['type'];
    /** The config to declare it on. Defaults to the global one. */
    config?: AparteConfig;
}>();

defineSlots<{
    /** What to draw for one segment, handed its latest state. */
    default(props: { segment: T }): unknown;
}>();

const entries = useMountedViews<T>(
    () => [props.type, props.config],
    (mount) => {
        const renderer = defineMountedSegmentRenderer<T>(props.type, mount);
        return props.config ? overrideSegmentRenderer(renderer, props.config) : overrideSegmentRenderer(renderer);
    },
);
</script>

<template>
    <Teleport v-for="entry in entries" :key="entry.key" :to="entry.host">
        <slot :segment="entry.view" />
    </Teleport>
</template>
