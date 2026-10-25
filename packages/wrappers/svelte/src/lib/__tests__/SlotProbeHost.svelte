<script lang="ts">
  import AparteChat from '../AparteChat.svelte';
  import MountProbe from './MountProbe.svelte';
  export let seen: { drawn: boolean | null };
</script>

<AparteChat messages={[]}>
  <svelte:fragment slot="composer"><MountProbe {seen} /></svelte:fragment>
</AparteChat>
