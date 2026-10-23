---
'@aparte/react': patch
'@aparte/vue': patch
'@aparte/svelte': patch
'@aparte/angular': patch
---

The framework components' typing line and their "Loading the conversation" announcement now follow a language switch (`config.setLocale(...)`); they used to stay in the language the chat was mounted in.

Every other string in the chat is drawn by core's elements, which listen to their config. These two are drawn by the wrapper itself, and none of the four re-read them on a config change: React did not subscribe, Vue's `computed` and Svelte's `$:` do not see the config, and Angular's `OnPush` getters were not re-run. Each wrapper now subscribes to its config for as long as it is mounted.
