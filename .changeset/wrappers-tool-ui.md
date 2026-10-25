---
"@aparte/react": minor
"@aparte/vue": minor
"@aparte/svelte": minor
"@aparte/angular": minor
---

Draw a tool call with your own component: `<AparteToolUI name="…">` (React, Vue, Svelte 5) or `<ng-template aparteToolUI="…">` (Angular).

The card renders from where you declare it, so it reads your app's contexts — React context through a portal, Vue `inject` through `Teleport`, Svelte `getContext` (the snippet is mounted with the declaration's contexts), Angular DI (the view is created where the template is declared, and it works zoneless). It is mounted once per call and updated in place when the call changes, so a component keeps its local state when the result arrives. It is unmounted when the call leaves the page or when the declaration unmounts, and the call goes back to core's row; a declaration made while calls are already on screen takes them over. Of two declarations for one tool the newer wins, and removing the older keeps it. A server render declares nothing and draws nothing: the cards appear in the browser.

`AparteSegmentUI` (`<ng-template aparteSegmentUI="…">` with `AparteSegmentUIDirective` in Angular) does the same for a segment type. In Svelte both are in `@aparte/svelte/runes`. Vue also exports `isAparteElement`, the test to give `compilerOptions.isCustomElement`: it accepts the `aparte-*` elements and leaves the wrapper's own components, written in kebab case, to Vue.

React and Vue gain a server-render test project of their own, as Svelte and Angular already had.
