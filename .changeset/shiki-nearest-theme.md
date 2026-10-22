---
'@aparte/plugin-shiki': patch
---

A light/dark theme pair now follows the nearest `data-aparte-theme`, not the page: a chat set light inside a dark page gets the light code theme, and a dark chat in a light page the dark one.

Both rules of the pair's stylesheet matched any ancestor — `[data-aparte-theme="dark"] .shiki`, and the system-dark one on `:root` — so a chat forced light kept dark code. Each attributed element now sets an inherited switch of aparté's own name (`--aparte-shiki-dark-on`) for its subtree, so the nearest one decides, in every browser. It does not read `color-scheme`, which a host page sets too (Angular Material writes `html { color-scheme: light dark }`). Measured in Chromium, WebKit and Firefox, with and without a host `color-scheme`, the attribute on `<html>` or on a chat.
