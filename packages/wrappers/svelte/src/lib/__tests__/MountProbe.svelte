<script lang="ts">
  // What a slot's component does on mount: talk to a core element it rendered. Its onMount
  // runs before the chat's, so the element has to be live by then.
  import { onMount } from 'svelte';
  export let seen: { drawn: boolean | null };
  let el: HTMLElement;
  onMount(() => { seen.drawn = !!el.querySelector('button'); });
</script>

<aparte-composer-send bind:this={el}></aparte-composer-send>
