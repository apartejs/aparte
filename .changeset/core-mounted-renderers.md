---
"@aparte/core": minor
---

Draw a tool call or a segment with your own component: `defineMountedToolRenderer(mount)` mounts it, updates it and unmounts it with the element, and `overrideToolRenderer(match, renderer)` returns the function that takes it off again.

`defineMountedToolRenderer` and `defineMountedSegmentRenderer(type, mount)` turn a mount function into a complete renderer: core creates the host, calls the mount once when the host is in the page, forwards every change of the call to the returned `update` (never a remount, so a component keeps its state when the result arrives) and calls `destroy` when the host leaves for good. A card receives one `AparteToolCallView` (`toToolCallView`): `id`, `name`, `input`, `status`, `result`, `structuredResult`, `deferred`, `refusal`, `abortCause` and the segment. New types: `AparteToolCallView`, `AparteMountedView`, `AparteToolMount`, `AparteSegmentMount`.

The registries are live: registering, unregistering or overriding a tool renderer — or a segment renderer — redraws the calls (or segments) already on screen that it now draws, and only those; the renderer that drew them gets its `cleanup`. `overrideToolRenderer` and `overrideSegmentRenderer` stack: the newer declaration wins, taking off an older one leaves it, and taking off the last restores what was there before — core's own renderer, for a built-in segment type like `code`. `registerToolRenderer` and `unregisterToolRenderer` now notify the config's subscribers when they change something.
