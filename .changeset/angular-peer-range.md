---
"@aparte/angular": minor
"@aparte/plugin-model-selector": patch
---

`@aparte/angular` installs on Angular 20 and 21, not only 19.

The peer range is `^19.2.0 || ^20.0.0 || ^21.0.0`. The package is still compiled on 19.2 in Angular's partial mode, which Angular guarantees a newer application can link, so one build serves the three majors. What makes the range a fact rather than a hope: the specs run on 19 (with zone.js, zoneless, and in a server render), and the repo's Angular example now runs on 21, zoneless, driven in a real browser by the end-to-end suite. Angular 19 is past its upstream support window and leaves the range at 1.0. Angular 22 joins once it is exercised the same way.

`@aparte/plugin-model-selector` follows: its optional `@angular/core` peer (for the `./angular` entry) takes the same range, since a narrower one would fail `npm install` on Angular 20 and 21 even for an app that never imports that entry.
