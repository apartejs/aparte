<script lang="ts">
  /*
   * The chat as the coverage test renders it: every element that sends an event exists — the
   * messages' bubbles, the attachment strip, a composer action in the toolbar slot — and the
   * chat's instance goes out through `instance()`, for `$on`, the Svelte 4 way to listen to a
   * component. The two callback props the chat has had since #47 pass through.
   */
  import AparteChat from '../AparteChat.svelte';
  import type { AparteMessage } from '@aparte/core';

  export let messages: AparteMessage[] = [];
  export let actionId = '';
  export let onmessageSent: ((detail: unknown, event: Event) => void) | undefined = undefined;
  export let onaction: ((detail: unknown, event: Event) => void) | undefined = undefined;

  let chat: unknown;
  export function instance(): unknown { return chat; }
</script>

<AparteChat bind:this={chat} {messages} attachments {onmessageSent} {onaction}>
  <svelte:fragment slot="toolbar"><aparte-composer-action action-id={actionId}></aparte-composer-action></svelte:fragment>
</AparteChat>
