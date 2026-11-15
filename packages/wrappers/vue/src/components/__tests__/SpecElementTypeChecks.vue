<script setup lang="ts">
/*
 * What vue-tsc must say about an element typed from its spec (`AparteVueElement`, see
 * `fx-widget-spec.ts`) — never mounted, only checked (`typecheck:tests`). A line under
 * `@vue-expect-error` must be an error.
 */
import { ref } from 'vue';
import './fx-widget-spec.js';

const items = ref<string[]>(['a']);
const sink = ref<string[]>([]);
defineExpose({ items, sink });
</script>

<template>
  <fx-widget label="Hi" compact :items="items" @fx-widget-pick="sink.push($event.detail.value)" />

  <!-- The property is a list of strings. -->
  <!-- @vue-expect-error -->
  <fx-widget :items="5" />
  <!-- The listener receives the detail the spec says. -->
  <!-- @vue-expect-error -->
  <fx-widget @fx-widget-pick="sink.push($event.detail.nonexistent)" />
</template>
