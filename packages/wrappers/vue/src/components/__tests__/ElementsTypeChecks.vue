<script setup lang="ts">
/*
 * What vue-tsc must say about a raw aparté tag in a template — never mounted, only checked
 * (`typecheck:tests`). A line under `@vue-expect-error` must be an error: when the typings stop
 * catching it, the directive is unused and THAT is the error.
 *
 * Why these four. Before the element members were generated, vue-tsc checked a single-word
 * attribute (`<aparte-select :value="5">` failed) and nothing else: Vue looks a kebab-case
 * attribute up by its camelCase name, and the registry's keys are kebab-case, so `:active-id`
 * was never found and never checked; a property-only member (`conversations`) was not a prop;
 * and the events were not on the tag, so `$event` was `any`.
 */
import { ref } from 'vue';
import type { AparteConversationListItem } from '@aparte/core';

const rows = ref<AparteConversationListItem[]>([]);
// A `string | null`, as `useConversationManager()` gives it.
const activeId = ref<string | null>(null);
const sink = ref<unknown[]>([]);
defineExpose({ rows, activeId, sink });
</script>

<template>
  <!-- What the issue wants, written the way a Vue app writes it. -->
  <aparte-conversation-list
    :conversations="rows"
    :active-id="activeId"
    flat=""
    @aparte-conversation-select="sink.push($event.detail.id)"
    @aparte-conversation-delete="(e) => sink.push(e.detail.id)"
  />
  <aparte-select :value="activeId" searchable="" @aparte-select-change="(e) => sink.push(e.detail.value)" />
  <aparte-select @aparte-select-open="sink.push($event.detail)" />
  <!-- A presence attribute written bare, the way a Vue template writes any: the compiler gives it
       `true` where an HTML tag gets `""`, and it is on either way. -->
  <aparte-select searchable />
  <aparte-suggestions empty-only :suggestions.attr="'[]'" />

  <!-- A multi-word attribute is checked like a single-word one: a number is not a string. -->
  <!-- @vue-expect-error -->
  <aparte-conversation-list :active-id="5" />
  <!-- `false` is not "off" for a presence attribute: Vue would write `searchable="false"`, which is on. -->
  <!-- @vue-expect-error -->
  <aparte-select :searchable="false" />
  <!-- The property is a list of conversations. -->
  <!-- @vue-expect-error -->
  <aparte-conversation-list :conversations="'nope'" />
  <!-- The listener receives the event of the tag, with the detail the tag sends. -->
  <!-- @vue-expect-error -->
  <aparte-conversation-list @aparte-conversation-select="(e: CustomEvent<{ nope: number }>) => sink.push(e.detail.nope)" />
  <!-- @vue-expect-error -->
  <aparte-conversation-list @aparte-conversation-select="sink.push($event.detail.nonexistent)" />
</template>
