<script lang="ts">
  /*
   * `<aparte-conversation-list>` as a Svelte app writes it: the rows as a binding, the active
   * conversation as an attribute, the events as `on:` handlers — the issue's case, in Svelte.
   * Mounted by `elements.test.ts`; its types are checked by `typecheck:tests` all the same.
   */
  import type { AparteConversationListItem, AparteConversationSelectDetail } from '@aparte/core';

  export let rows: AparteConversationListItem[] = [
    { id: 'c1', title: 'First' },
    { id: 'c2', title: 'Second' },
  ];
  // A `string | null`, as `useConversationManager()` gives it.
  export let activeId: string | null = null;
  let picked: AparteConversationSelectDetail[] = [];
  let deleted: string[] = [];

  export function events(): { picked: AparteConversationSelectDetail[]; deleted: string[] } {
    return { picked, deleted };
  }
  // The Svelte 5 types of a component no longer carry `$set`, so the test goes through a function.
  export function setActive(id: string | null): void {
    activeId = id;
  }
</script>

<aparte-conversation-list
  conversations={rows}
  active-id={activeId}
  on:aparte-conversation-select={(e) => { picked = [...picked, e.detail]; }}
  on:aparte-conversation-delete={(e) => { deleted = [...deleted, e.detail.id]; }}
></aparte-conversation-list>
