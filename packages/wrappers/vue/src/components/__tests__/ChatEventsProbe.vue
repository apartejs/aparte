<script setup lang="ts">
/*
 * The generated emits interface, handed to `defineEmits` exactly as the chat component will
 * hand it: Vue's SFC compiler must read an imported interface to know which listeners are
 * emits, and it resolves no mapped type. A test-only component, so the claim is proven
 * before the chat depends on it.
 */
import type { AparteLinkClickEventDetail } from '@aparte/core';
import type { AparteChatEventEmits } from '../../generated/chat-events';

const emit = defineEmits<AparteChatEventEmits>();

function fireLink(detail: AparteLinkClickEventDetail, event: CustomEvent<AparteLinkClickEventDetail>): void {
  emit('linkClick', detail, event);
}

function fireStop(event: CustomEvent<null>): void {
  emit('stop', null, event);
}

defineExpose({ fireLink, fireStop });
</script>

<template>
  <div class="probe" />
</template>
