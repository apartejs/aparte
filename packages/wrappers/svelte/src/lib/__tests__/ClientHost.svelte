<script lang="ts">
  // Probe: `createAparteClient` uses Svelte's onMount/onDestroy, so it can only run
  // inside a component. The api travels OUT through a callback prop — reading a prop
  // off the instance would need `accessors`, and a callback is what a consumer of a
  // factory-in-a-component would do anyway.
  import { createAparteClient } from '../stores/aparteClient';
  import type { AparteClientOptions } from '@aparte/core';

  export let options: AparteClientOptions = {};
  export let onReady: (api: ReturnType<typeof createAparteClient>) => void = () => {};

  onReady(createAparteClient(options));
</script>

<div data-client-host />
