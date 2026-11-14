<script setup lang="ts">
/*
 * The chat as an app writes it for an event core has no emit for: `@aparte-test-plugin-event`
 * on `<AparteChat>`, compiled by the SFC compiler as an app's own template would be. The
 * listener falls through to the chat's root element, where the event arrives.
 */
import { ref } from 'vue';
import AparteChat from '../AparteChat.vue';
import type { AparteMessage } from '../../types';

defineProps<{ messages?: AparteMessage[] }>();
const heard = ref<CustomEvent[]>([]);
const chat = ref<InstanceType<typeof AparteChat> | null>(null);
defineExpose({ heard, chat });
</script>

<template>
  <AparteChat ref="chat" :messages="messages" @aparte-test-plugin-event="heard.push($event)" />
</template>
