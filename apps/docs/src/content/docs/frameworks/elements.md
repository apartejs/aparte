---
title: Placing elements, typed
description: Every aparté element has a typed surface in all four frameworks — real attributes, real events, checked by your compiler. Plus the escape hatch for an element aparté does not define.
sidebar:
  order: 6
---

`<AparteChat>` gives you the whole turn in one tag. Everything else — the model selector, the
conversation list, a composer you compose yourself — is a **custom element you place**, and this page
is about placing those with your compiler on your side.

## What "typed" means here

Every element's attribute surface is declared once in `@aparte/core` and consumed by all four
wrappers. The registry is `AparteElementAttributes`, one entry per tag, with `AparteElementTagName`
as its key union:

```ts
import type { AparteElementAttributes, AparteElementTagName, AparteSelectAttributes } from '@aparte/core';

// One entry per tag. The wrappers derive their own typing from this, so an element added
// to core is typed in every framework the moment it lands here.
type SelectAttrs = AparteElementAttributes['aparte-select'];   // = AparteSelectAttributes
type EveryTag = AparteElementTagName;                          // 'aparte-chat' | 'aparte-select' | …

const preset: AparteSelectAttributes = { placeholder: 'Pick a model', searchable: true };
```

The per-element interfaces are exported individually too, when you want to type your own wrapper
around one: `AparteChatAttributes`, `AparteChatViewportAttributes`, `AparteChatBubbleAttributes`,
`AparteChatStatusAttributes`, `AparteComposerAttributes`, `AparteComposerInputAttributes`,
`AparteComposerActionAttributes`, `AparteComposerAddAttachmentAttributes`,
`AparteComposerToolbarAttributes`, `AparteConversationListAttributes`, `AparteSelectAttributes`,
`AparteOptionAttributes`, `AparteOptgroupAttributes`, `AparteProgressSpinnerAttributes`,
`AparteModelSelectorAttributes`, and `AparteNoAttributes` for the four that observe nothing.

### The one thing to know about presence attributes

An aparté element is **attribute-driven**: it reacts to an attribute being present, not to a
property being assigned. In a template that means `false` is the wrong value to write, because
React, Vue and Svelte all stringify what they set on a custom element — `searchable={false}` renders
`searchable="false"`, and code that tests `hasAttribute` reads that as **on**.

So in those three, a presence attribute is `'' | null | undefined`, and the types enforce it. Write
`''` to set and `null` (or `undefined`) to remove. `AparteTemplateAttrs` and `AparteAttrValue` are
the mapping that does it, exported in case you build your own template integration:

```ts
import type { AparteTemplateAttrs, AparteAttrValue, AparteSelectAttributes } from '@aparte/core';

type InATemplate = AparteTemplateAttrs<AparteSelectAttributes>;
//   searchable?: '' | null | undefined     ← not boolean, on purpose
//   placeholder?: string
type Presence = AparteAttrValue<boolean>;   // '' | null | undefined
```

Angular is the exception, and its directives take a real `boolean` — see below.

## React

The `aparte-*` tags are typed JSX intrinsics as soon as you import from `@aparte/react`. Nothing to
register:

```tsx
// A composer you compose yourself, slotted into <AparteChat>.
<div className="aparte-composer-row">
  <aparte-composer-input placeholder="Ask anything…" max-height={320} />
  <aparte-composer-send />
</div>
```

Attribute names are the HTML ones (`max-height`, `message-id`, `data-role`). A typo is a type error;
so is an attribute the element does not observe.

Events reach you by ref, and they are typed through the DOM because `@aparte/core` augments
`HTMLElementEventMap`:

```ts
const select = document.querySelector('aparte-select');
select?.addEventListener('aparte-select-change', (e) => {
    // e.detail is AparteSelectChangeDetail — value, label, previousValue
    console.info(e.detail.value, e.detail.previousValue);
});
```

## Vue

Declared through `GlobalComponents`, so `vue-tsc` checks them in any template once the package is
imported:

```vue
<aparte-select placeholder="Pick a model" searchable="" @aparte-select-change="e => pick(e.detail.value)">
  <aparte-option value="gpt-4o-mini">GPT-4o mini</aparte-option>
</aparte-select>
```

Remember `:searchable="null"` to remove rather than `:searchable="false"`.

## Svelte

Declared through `SvelteHTMLElements`, so `svelte-check` covers them:

```svelte
<aparte-select placeholder="Pick a model" searchable="" on:aparte-select-change={(e) => pick(e.detail.value)}>
  <aparte-option value="gpt-4o-mini">GPT-4o mini</aparte-option>
</aparte-select>
```

## Angular

Angular is the one wrapper that ships code for this, for two structural reasons: its template
compiler rejects a tag nothing claims, and `[placeholder]="x"` writes a *property* — which on an
attribute-driven element is a silent no-op, or a throw on one of `<aparte-composer>`'s eight
getter-only accessors.

So each element has a **standalone directive** whose selector is the tag. Import the ones you use,
or all of them at once:

```ts
import { Component } from '@angular/core';
import { APARTE_ELEMENT_DIRECTIVES } from '@aparte/angular';

@Component({
    selector: 'app-picker',
    standalone: true,
    imports: [...APARTE_ELEMENT_DIRECTIVES],
    template: `
        @if (showPicker) {
            <aparte-model-selector
                [persist]="true"
                [searchable]="true"
                (modelChange)="use($event.modelId)"
            ></aparte-model-selector>
        }
    `,
})
export class PickerComponent {
    protected readonly showPicker = true;
    protected use(modelId: string): void { console.info(modelId); }
}
```

Three things that follow from the directive, and none of them work through `<aparte-ui>`:

- **No `CUSTOM_ELEMENTS_SCHEMA`.** The directive claims the tag, so you keep template checking for
  every *other* unknown tag in that file — which the schema switches off wholesale.
- **`@if` and `@for` work on the element**, and so does content projection, because the tag is
  really in the template.
- **Inputs take `boolean`**, not `''`: `[searchable]="true"` goes through Angular's
  `booleanAttribute` and the directive writes or removes the attribute for you.

Outputs emit the event's **detail**, which is the Angular idiom — `(selectChange)="pick($event.value)"`.
When you need the event itself (to call `stopPropagation`), add a plain host listener.

The directives are `AparteChatViewportDirective`, `AparteChatBubbleDirective`,
`AparteChatStatusDirective`, `AparteComposerDirective`, `AparteComposerInputDirective`,
`AparteComposerActionDirective`, `AparteComposerAddAttachmentDirective`,
`AparteComposerAttachmentsDirective`, `AparteComposerSendDirective`, `AparteComposerCancelDirective`,
`AparteComposerToolbarDirective`, `AparteSelectDirective`, `AparteOptionDirective`,
`AparteOptgroupDirective`, `AparteConversationListDirective`, `AparteProgressSpinnerDirective`,
`AparteElicitationDirective`, `AparteModelSelectorDirective` and `AparteAskUserDirective`.

`<aparte-chat>` has no directive on purpose: `AparteChatComponent` already claims that tag and
renders the whole turn.

## `<aparte-ui>` is the escape hatch, not the default

Every wrapper still ships `AparteUi`, a pass-through that mounts **any** element by name and
forwards its events. It exists for an element aparté does not define — one of yours, or a
third-party web component:

```tsx
<AparteUi name="my-token-counter" props={{ 'data-budget': '8000' }} onElementEvent={log} />
```

For aparté's own elements, reach for the typed surface above instead. `name` is a string, `props` is
an untyped bag, and the element is created imperatively — so no control flow or projection reaches
it. That was the only way to place a model selector in Angular before the directives existed; it is
not the way now.

## Where the facts come from

The attribute and event surface of every element is in the generated
[API reference](/reference/api/), including each event's detail type. Both are produced from the
custom-elements manifest, which is built from the element source — so the reference, the types on
this page and the elements themselves cannot drift apart.
