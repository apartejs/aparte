<script lang="ts">
  /*
   * A parent that hands `<AparteUi>` its prop bag again, the way an app's component does when it
   * re-renders: only `props` changes. (The testing library's `rerender` swaps every prop at once,
   * which recreates the element and would test nothing.)
   */
  import AparteUi from '../../runes/AparteUi.svelte';

  let { initial }: { initial: Record<string, unknown> } = $props();
  // svelte-ignore state_referenced_locally
  let bag = $state.raw(initial);

  export function hand(next: Record<string, unknown>): void {
    bag = next;
  }
</script>

<AparteUi name="fx-probe" props={bag} />
