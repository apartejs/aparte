<script lang="ts">
  /**
   * Type-only guard: every event an aparté element dispatches is bindable with `on:`.
   *
   * Nothing renders this — `svelte-check` reading it is the whole point, and it runs over
   * `src/**` through `typecheck:tests`.
   *
   * Why it exists. The `on:` surface derives from `HTMLElementEventMap`, which
   * deliberately omits the five events that carry no detail. That was harmless while it
   * only governed `addEventListener`; then this wrapper DECLARED the tags, which removed
   * `SvelteHTMLElements`' catch-all index signature — and `on:aparte-cancel`, the stop
   * button, stopped type-checking. A typed surface that takes a capability away is worse
   * than no typed surface, and nothing caught it because no fixture listened for a
   * detail-less event.
   *
   * The five are all bound below. They are also all Angular `@Output()`s, so this is a
   * parity assertion as much as a typing one.
   *
   * POSITIVE ONLY, deliberately: a Svelte template has no `@ts-expect-error`, so a
   * negative case would just fail the check it is meant to pass. The React fixture
   * (`apps/examples/react/src/jsx-intrinsics.typecheck.tsx`) carries the rejection half.
   */
  let log: string[] = [];
  const note = (what: string): void => { log = [...log, what]; };
</script>

<!-- The five with NO detail — the ones that regressed. -->
<aparte-composer
  on:aparte-cancel={() => note('cancel')}
  on:aparte-send={(e) => note(e.detail.content)}
>
  <aparte-composer-input on:aparte-composer-submit={() => note('submit')} />
</aparte-composer>

<aparte-chat-viewport on:aparte-reset-done={() => note('reset')} />

<aparte-select
  on:aparte-select-open={() => note('open')}
  on:aparte-select-close={() => note('close')}
  on:aparte-select-change={(e) => note(e.detail.value)}
/>

<!-- And a detail-carrying one per remaining element family, so the map half stays proven. -->
<aparte-chat-bubble
  message-id="m1"
  data-role="assistant"
  on:aparte-retry={(e) => note(e.detail.messageId)}
  on:aparte-branch-navigate={(e) => note(String(e.detail.direction))}
/>

<aparte-conversation-list on:aparte-select-conversation={(e) => note(e.detail.id)} />

<aparte-optgroup label="g" on:aparte-optgroup-toggle={(e) => note(String(e.detail.collapsed))} />

<aparte-composer-action action-id="mic" on:aparte-action-click={(e) => note(e.detail.actionId)} />

{#if log.length}<span>{log.join(',')}</span>{/if}
