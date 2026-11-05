---
'@aparte/core': major
---

Upgrade every `@aparte/*` package to 1.0.0 together, then follow [Upgrading to 1.0](https://apartejs.dev/guides/upgrading/) for what to change. From 1.0.0 on, the declared surface keeps its names, and what they do, until 2.0.

- **What most apps change.** A picture a model or a tool chose waits for a click unless `aparteGlobalConfig.setImagePolicy` allows where it comes from. The names the beta marked deprecated are removed. A `CompactionTarget` needs `updateMessage`.
- **What is frozen.** Elements and the attributes they document, event names, the functions, classes and constants each package's main entry exports, the keys of `AparteLocale` and the `--aparte-*` token names — and what each one's documentation says it does, its defaults included. A frozen name leaves only after a notice in a minor, in the next major. [Stability](https://apartejs.dev/reference/stability/) lists every name, and what is not frozen: methods, interface fields, type names, class names, how a default looks.
- **Peer ranges.** Each `@aparte` package asks for the others at `>=1.0.0 <2.0.0`, so a 0.x package beside a 1.x one is a peer conflict your package manager reports.
- **Security.** Only the latest 1.x release receives security fixes. [SECURITY.md](https://github.com/apartejs/aparte/blob/main/SECURITY.md) says how to report a vulnerability and how soon you hear back.
