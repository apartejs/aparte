<script setup lang="ts">
/**
 * Your own Vue component for a segment type — one your stream emits, or a built-in such as
 * `code`. Teleported into each segment like `<AparteToolUI>`; taking the last declaration off
 * a built-in type gives it back to core's renderer.
 *
 * The segment's shape is the app's: the slot hands it as a base segment with its own fields,
 * so a typed template narrows it — `(segment as ChartSegment).points`. A Vue template cannot pass
 * a type argument, and the `type` prop cannot carry one.
 */
import { toRaw } from 'vue';
import { defineMountedSegmentRenderer, overrideSegmentRenderer } from '@aparte/core';
import type { AparteConfig, AparteSegmentBase } from '@aparte/core';
import { useMountedViews } from '../composables/useMountedViews.js';

type AnySegment = AparteSegmentBase & Record<string, unknown>;

const props = defineProps<{
    /** The segment `type` this draws. */
    type: string;
    /** The config to declare it on. Defaults to the global one. */
    config?: AparteConfig;
}>();

defineSlots<{
    /** What to draw for one segment, handed its latest state. */
    default(props: { segment: AnySegment }): unknown;
}>();

// The config unwrapped: a config held in a ref reaches here as Vue's reactive proxy, and core
// keys its registries by the instance the chat holds.
const config = () => (props.config ? toRaw(props.config) : undefined);

const entries = useMountedViews<AnySegment>(
    [() => props.type, config],
    (mount) => {
        const renderer = defineMountedSegmentRenderer<AnySegment>(props.type, mount);
        const target = config();
        return target ? overrideSegmentRenderer(renderer, target) : overrideSegmentRenderer(renderer);
    },
);
</script>

<template>
    <Teleport v-for="entry in entries" :key="entry.key" :to="entry.host">
        <slot :segment="entry.view" />
    </Teleport>
</template>
