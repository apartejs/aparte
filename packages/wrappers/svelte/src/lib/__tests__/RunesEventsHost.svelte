<script lang="ts">
  /**
   * Type-only guard: the runes form of an event handler — an attribute, `onaparte-send={…}` —
   * type-checks on a declared tag, with the event's detail typed.
   *
   * Nothing renders this; `svelte-check` reads it through `typecheck:tests`. The tags were typed
   * with `on:aparte-*` only, so a Svelte 5 app writing the attribute form on a declared tag got
   * an unknown-attribute error. Positive only, like EventSurfaceHost: a template has no
   * `@ts-expect-error`.
   */
  let sent = '';
</script>

<aparte-composer onaparte-send={(e) => { sent = e.detail.content; }}></aparte-composer>
<aparte-composer-send onaparte-cancel={() => { sent = ''; }}></aparte-composer-send>
<p>{sent}</p>
