---
"@aparte/core": patch
"@aparte/react": patch
"@aparte/vue": patch
"@aparte/svelte": patch
"@aparte/angular": patch
---

`AparteClient` echoes the user's message by default — pass `echoUserMessage: false` if your host already appends it.

The optimistic user bubble used to be every raw-core host's job: everyone wrote the
same `aparte-send` handler, and whoever forgot shipped a chat where the person cannot
see what they typed — it compiles, it streams, and nothing errors. Three consumers hit
exactly that. Attached files ride the echoed bubble as attachments. The wire cannot
double: the history builder already excludes trailing unanswered user messages. The
four framework wrappers pass `false` themselves — their ConversationController owns
the transcript — so wrapper apps see no change.
