<script lang="ts">
  // The documented pattern, Svelte 5: the open conversation in the page's state, handed back to
  // the chat — from the creation callback, or from `createConversations().activeId`.
  import AparteChat from '../../runes/AparteChat.svelte';
  import { createConversations } from '../../runes/index.js';
  import type { AparteChatImperativeApi, AparteConfig, AparteStorageAdapter } from '@aparte/core';

  let { config, adapter, bound = 'created', seen }: {
    config: AparteConfig;
    adapter: AparteStorageAdapter;
    bound?: 'created' | 'activeId';
    seen: Array<string | null>;
  } = $props();

  const conversations = createConversations();
  let ready = $state(false);
  let created = $state<string | null>(null);
  let chat = $state<AparteChatImperativeApi>();
  void conversations.init(adapter, config).then(() => { ready = true; });

  const conversationId = $derived(bound === 'created' ? created : conversations.activeId);
  $effect.pre(() => { seen.push(conversationId); });

  export function api(): AparteChatImperativeApi | undefined { return chat; }
</script>

{#if ready}
  <AparteChat bind:this={chat} id="chat-a" {config} {conversationId} onconversationCreated={(id) => (created = id)} />
{/if}
