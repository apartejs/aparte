---
'@aparte/core': minor
'@aparte/locale-fr': minor
---

A conversation search that matches nothing now says so: the list shows a status line (new locale key `conversationSearchEmpty`, "No conversation matches") and carries `data-no-match`, and `sidebar.filter(query)` returns how many conversations match.

The filter moved into `<aparte-conversation-list>` as `filter(query)`, so the query holds through the list's renders — a conversation added while a search was typed used to appear unfiltered. The sidebar's search field and `filter()` call it on each list inside.
