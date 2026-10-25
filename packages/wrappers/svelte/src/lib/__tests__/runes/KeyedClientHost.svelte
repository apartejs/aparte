<script lang="ts">
  /** A page that gives the client its key, as the docs show for SvelteKit. */
  import { AparteChat, createAparteClient } from '../../runes/index.js';

  let { resolve }: { resolve: (providerId: string) => string } = $props();
  createAparteClient({ keyResolver: (providerId) => resolve(providerId) });
</script>

<AparteChat />
