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

Every **core** element's attribute surface is declared once in `@aparte/core` and consumed by all
four wrappers. The registry is `AparteElementAttributes`, one entry per tag, with
`AparteElementTagName` as its key union:

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
`AparteOptionAttributes`, `AparteOptgroupAttributes`, `AparteProgressSpinnerAttributes`, and
`AparteNoAttributes` for the four that observe nothing.

An element that does **not** come from core — from a plugin, or one of yours — is not in this
registry, and that is the boundary rather than an omission. See
[Your own element, or a plugin's](#your-own-element-or-a-plugins).

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
            <aparte-select
                [searchable]="true"
                placeholder="Pick a model"
                (selectChange)="use($event.value)"
            ></aparte-select>
        }
    `,
})
export class PickerComponent {
    protected readonly showPicker = true;
    protected use(value: string): void { console.info(value); }
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
and `AparteElicitationDirective`.

`<aparte-chat>` has no directive on purpose: `AparteChatComponent` already claims that tag and
renders the whole turn.

## Your own element, or a plugin's

The typing above covers `@aparte/core`'s elements — the ones each wrapper depends on. Nothing else
is in it, including aparté's own plugins, and that is deliberate: a third-party plugin's author
cannot add a line to `@aparte/core`, so shipping typing for *our* plugins would give our packages a
privilege theirs could never have. The rule is symmetric instead — **whoever owns the element owns
its contract and its bindings.**

Two mechanisms, and they are the same amount of work for us as for you.

### React, Vue and Svelte: type the tag from your own package

All three learn a tag through **module augmentation**, and the augmentation does not have to come
from us. Put it in your own `.d.ts` and it applies exactly when your package is in the program —
install it and the tag is typed, don't and it isn't. TypeScript enforces that, nobody has to.

`AparteTemplateAttrs` is exported for this: it takes any interface of yours and gives back the
template spelling, so you inherit the presence-attribute rule rather than rediscovering it.

<!-- doc-check: skip augments 'vue', which the snippet compiler has no resolution for — it type-checks in a Vue app, which is the only place it belongs -->
```ts
import type { AparteTemplateAttrs } from '@aparte/core';

interface MyWidgetAttributes { label?: string; compact?: boolean }

declare module 'vue' {
    interface GlobalComponents {
        'my-widget': import('vue').DefineComponent<AparteTemplateAttrs<MyWidgetAttributes>>;
    }
}
```

Events need nothing from us at all — augment `HTMLElementEventMap` with your own detail type and
`e.detail` is typed everywhere, in every framework, the same way core's own events are.

### Angular: a directive, and it is six lines

Angular has no types-only path: claiming a tag needs a directive class, which is runtime code. The
one non-obvious part is already exported — `applyElementProps` is core's attribute-versus-property
rule, which is what makes a presence attribute land as `attr=""` and a `false` remove it:

```ts
import { Directive, ElementRef, Input, booleanAttribute, inject } from '@angular/core';
import { applyElementProps } from '@aparte/core';

@Directive({ selector: 'my-widget', standalone: true })
export class MyWidget {
    private readonly host = inject(ElementRef<HTMLElement>);
    @Input() set label(v: string | undefined) { this.write('label', v); }
    @Input({ transform: booleanAttribute }) set compact(v: boolean) { this.write('compact', v); }
    private write(name: string, value: unknown): void {
        applyElementProps(this.host.nativeElement, { [name]: value });
    }
}
```

That is what the Angular example does for `<aparte-model-selector>`, which comes from
[`@aparte/plugin-model-selector`](/plugins/model-selector/) rather than from core — read it there
for a working case. If you would rather not, `CUSTOM_ELEMENTS_SCHEMA` still works, and so does
`<aparte-ui>` below.

One thing to know either way: a hyphenated tag is legal HTML whether or not anything defines it, so
an element whose package you never imported mounts empty and inert with no error, and upgrades on
its own the moment the definition arrives. That is what makes lazy plugin loading work — and it
means the types promise a *shape*, never a *definition*.

## `<aparte-ui>` is the escape hatch, not the default

Every wrapper still ships `AparteUi`, a pass-through that mounts **any** element by name and
forwards its events. It exists for an element aparté does not define — one of yours, or a
third-party web component:

```tsx
<AparteUi name="my-token-counter" props={{ 'data-budget': '8000' }} onElementEvent={log} />
```

`name` is a string, `props` is an untyped bag, and the element is created imperatively — so no
control flow or projection reaches it. For core's elements the typed surface above is strictly
better; for anything else, the two mechanisms in the previous section beat it as soon as you care
about types. `<aparte-ui>` earns its place when you want none of that ceremony for a one-off.

## Where the facts come from

The attribute and event surface of every element is in the generated
[API reference](/reference/api/), including each event's detail type. Both are produced from the
custom-elements manifest, which is built from the element source — so the reference, the types on
this page and the elements themselves cannot drift apart.
