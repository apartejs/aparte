<script lang="ts">
  /*
   * An element typed from its spec (`AparteSvelteElement`, see `fx-widget-spec.ts`), as a Svelte
   * app writes it: never mounted, its types checked by `typecheck:tests`.
   */
  import './fx-widget-spec.js';

  export let items: string[] = ['a'];
  let picked: string[] = [];
  export function seen(): string[] {
    return picked;
  }
</script>

<fx-widget label="Hi" compact="" {items} on:fx-widget-pick={(e) => { picked = [...picked, e.detail.value]; }}></fx-widget>
