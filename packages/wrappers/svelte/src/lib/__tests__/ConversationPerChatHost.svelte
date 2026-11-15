<script lang="ts">
  // The documented pattern, Svelte 4: the open conversation in the page's state, handed back to
  // the chat — from the creation callback, or from the manager's `activeId` store.
  import AparteChat from '../AparteChat.svelte';
  import { createConversationManager } from '../stores/conversationManager';
  import type { AparteChatImperativeApi, AparteConfig, AparteStorageAdapter } from '@aparte/core';

  export let config: AparteConfig;
  export let adapter: AparteStorageAdapter;
  export let bound: 'created' | 'activeId' = 'created';
  export let seen: Array<string | null> = [];

  const cm = createConversationManager();
  const { activeId } = cm;
  let ready = false;
  let created: string | null = null;
  let chat: AparteChatImperativeApi;
  void cm.init(adapter, config).then(() => { ready = true; });

  $: conversationId = bound === 'created' ? created : $activeId;
  $: seen.push(conversationId);

  export function api(): AparteChatImperativeApi | undefined { return chat; }
</script>

{#if ready}
  <AparteChat bind:this={chat} id="chat-a" {config} {conversationId} onconversationCreated={(id) => (created = id)} />
{/if}
