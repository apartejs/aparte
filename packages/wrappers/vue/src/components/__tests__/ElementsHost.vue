<script setup lang="ts">
/*
 * `<aparte-conversation-list>` as an app writes it in a Vue template: the rows as a binding, the
 * events as listeners, on the raw tag — the issue's case, in Vue. Compiled by the SFC compiler
 * as an app's own is (`isCustomElement` on `aparte-*`, see vitest.config.ts), and read by
 * vue-tsc through `GlobalComponents`, which is what this file is for: `typecheck:tests` fails
 * on a binding or a listener the typings do not know.
 */
import { ref } from 'vue';
import type { AparteConversationListItem, AparteConversationSelectDetail } from '@aparte/core';

const rows = ref<AparteConversationListItem[]>([
    { id: 'c1', title: 'First' },
    { id: 'c2', title: 'Second' },
]);
// A `string | null`, as `useConversationManager()` gives it.
const activeId = ref<string | null>(null);
const picked = ref<AparteConversationSelectDetail[]>([]);
const deleted = ref<string[]>([]);
defineExpose({ rows, activeId, picked, deleted });
</script>

<template>
  <aparte-conversation-list
    :conversations="rows"
    :active-id="activeId"
    @aparte-conversation-select="picked.push($event.detail)"
    @aparte-conversation-delete="(e) => deleted.push(e.detail.id)"
  />
</template>
