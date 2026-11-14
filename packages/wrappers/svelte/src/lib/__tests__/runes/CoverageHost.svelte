<script lang="ts">
  /*
   * The runes chat as the coverage test renders it: every element that sends an event exists —
   * the messages' bubbles, the attachment strip, a composer action in the toolbar snippet — and
   * the callback props the test hands over are spread onto the chat, the way an app writes them.
   */
  import AparteChat from '../../runes/AparteChat.svelte';
  import type { AparteChatProps } from '../../runes/types.js';
  import type { AparteMessage } from '../../types.js';

  let { messages = [], actionId = '', callbacks = {} }: {
    messages?: AparteMessage[];
    actionId?: string;
    callbacks?: Partial<AparteChatProps>;
  } = $props();
</script>

<AparteChat {messages} attachments {...callbacks}>
  {#snippet toolbar()}<aparte-composer-action action-id={actionId}></aparte-composer-action>{/snippet}
</AparteChat>
