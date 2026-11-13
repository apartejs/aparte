---
'@aparte/plugin-compaction': patch
---

The summariser no longer reads an agent's activity (an `activity` segment) as the reply's text. Nothing to change in your code.

An activity whose content was a string (a scenario's, an app's own) went into the transcript the summary is written from, under the rule for a segment type the plugin does not know ("its `content`"). The model never reads an activity back — core's history serializer skips it by name — so the summariser, which reads what the model would have read, now skips it too.
