---
'@aparte/react': minor
'@aparte/core': patch
'@aparte/vue': minor
'@aparte/svelte': minor
---

Every element of core now has a React component — `<AparteConversationList>`, `<AparteLauncher>`, `<AparteSplit>`… — with its properties as props and its events as `onXxx` callbacks, the same under React 18 and 19.

```tsx
<AparteConversationList
  conversations={history.activeConversations}
  active-id={history.activeId}
  onConversationDelete={(detail) => void history.delete(detail.id)}
/>
```

Do you have to touch your code? No. The raw tags keep working, typed as they were. Two typing changes can show an error in code that was already wrong: **Vue now checks a multi-word attribute** (`:active-id="5"` passed unchecked, because Vue looks a kebab-case attribute up by its camelCase name) **and types the events** a tag sends, and **every attribute now accepts `null`** to remove it, in React, Vue and Svelte, so `active-id={history.activeId}`, a `string | null`, compiles as written.

- **24 components.** One per element but the chat, whose component stays `<AparteChat>`, named `Aparte` and the tag in Pascal case, each with an `Aparte…Props` type. Generated from the manifest like the Angular directives: an element, an attribute or an event added to core reaches React with no edit. A table of them is in the [wrapper reference](https://apartejs.dev/reference/wrappers/).
- **A callback is `(detail, event)`**, as `<AparteChat>`'s are: the detail first, so a handler written for it alone still fits, and the event second, where `event.preventDefault()` is. The conversation list's rename, pin, archive and delete are cancelable, and `manage` stands down when one is cancelled. A callback that changes takes no new listener.
- **Why not the raw tag.** React 18 writes a property as the text `[object Object]` and listens to no event; React 19 sets a prop as a property when the element has one of that name and as an attribute when it does not. A component writes its props itself after the render — attributes through `applyElementProps`, properties by assignment, events with `addEventListener` — and only the ones whose value changed. A presence attribute takes a `boolean` there (`flat`, `manage={false}`), where the raw tag has to write `''`.
- **Server rendering.** An element carries `defer-hydration` until React has hydrated it, as `<AparteChat>`'s root does, and an attribute an element reads once, at connect (`framework-managed` on the viewport), is in its first markup, not applied after.
- **Vue and Svelte.** Both already set a property an element has and listen to its events at runtime (a test mounts the raw list in each); what they lacked was the types. A property such as the list's `conversations` is now typed in both, and Vue declares each tag's events as emits, from a file generated from the manifest (`--element-members`). A presence attribute written bare in a Vue template, `<aparte-select searchable>`, is accepted as it is, and `false` is not. `@aparte/core` widens `AparteAttrValue` to accept `null`.
- **Weight.** `@aparte/react` goes from 5.4 KB to 7.3 KB gzip (+1.9 KB): a table row for each of the 24 components, and the one function behind them. An app pays for the ones it imports. A bundle of `<AparteConversationList>` alone holds one `createAparteElement` call and none of the other 23 components' names, and a bundle of all of them holds 24 (esbuild, `sideEffects: false` and a `/* @__PURE__ */` on each). The package's budget in `size-budget.json` rises from 5.5 to 7.75 KB.
