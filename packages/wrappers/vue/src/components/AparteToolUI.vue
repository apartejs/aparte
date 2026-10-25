<script setup lang="ts" generic="I = unknown, R = unknown">
/**
 * Your own Vue component in a tool call.
 *
 * `<AparteToolUI name="get_weather" v-slot="{ tool }"><WeatherCard :tool="tool" /></AparteToolUI>`
 * draws every `get_weather` call with your component for as long as it is mounted, and gives
 * the calls back to core's row when it unmounts. The slot is teleported into each card, so it
 * renders from where you put the declaration: `inject` reads what your app provides there.
 *
 * Underneath it is core's `overrideToolRenderer` + `defineMountedToolRenderer`. Nothing is
 * declared in a server render; the cards are drawn in the browser.
 */
import { toRaw } from 'vue';
import { aparteGlobalConfig, defineMountedToolRenderer } from '@aparte/core';
import type { AparteConfig, AparteToolCallView, AparteToolMatcher } from '@aparte/core';
import { useMountedViews } from '../composables/useMountedViews.js';

const props = defineProps<{
    /** The tool this draws: a name, a `RegExp`, or `'*'` for every tool. */
    name: AparteToolMatcher;
    /** The config to declare it on. Defaults to the global one. */
    config?: AparteConfig;
}>();

defineSlots<{
    /** What to draw for one call: its id, name, input, status, result and the rest. */
    default(props: { tool: AparteToolCallView<I, R> }): unknown;
}>();

// The config unwrapped: a config held in a ref reaches here as Vue's reactive proxy, and core
// keys its registries by the instance the chat holds.
const config = () => (props.config ? toRaw(props.config) : aparteGlobalConfig);

// Two sources, compared one by one: the matcher by its text — a `RegExp` built in a render is a
// new object every time, the same declaration — and the config.
const entries = useMountedViews<AparteToolCallView>(
    [() => (typeof props.name === 'string' ? props.name : String(props.name)), config],
    (mount) => config().overrideToolRenderer(props.name, defineMountedToolRenderer(mount)),
);
</script>

<template>
    <Teleport v-for="entry in entries" :key="entry.key" :to="entry.host">
        <slot :tool="(entry.view as AparteToolCallView<I, R>)" />
    </Teleport>
</template>
