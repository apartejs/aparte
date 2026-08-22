<script lang="ts">
  // Probe for `createConversationManager` (it registers an onDestroy). The store
  // bundle travels out through a callback prop — see ClientHost for why.
  import { createConversationManager } from '../stores/conversationManager';

  export let onReady: (api: ReturnType<typeof createConversationManager>) => void = () => {};

  onReady(createConversationManager());
</script>

<div data-conversation-host></div>
