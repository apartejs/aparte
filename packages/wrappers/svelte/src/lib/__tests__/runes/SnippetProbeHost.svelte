<script lang="ts">
  import AparteChat from '../../runes/AparteChat.svelte';
  import MountProbe from '../MountProbe.svelte';

  let { seen }: { seen: { drawn: boolean | null } } = $props();
</script>

<AparteChat>
  {#snippet composer()}<MountProbe {seen} />{/snippet}
</AparteChat>
