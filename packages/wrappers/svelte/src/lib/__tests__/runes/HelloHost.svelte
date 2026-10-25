<script lang="ts">
  /** The Svelte 5 hello world: the client started, a bare chat. */
  import { AparteChat, createAparteClient } from '../../runes/index.js';

  createAparteClient();
</script>

<AparteChat />
