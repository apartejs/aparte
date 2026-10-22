---
'@aparte/plugin-approval': patch
---

`<aparte-approval-mode>` no longer warns "found no approval setup" when you follow the documented order: the tag in the page, then `setupApproval()` in the script that imports the plugin.

Importing the plugin defines the element, so a tag already in the page bound before the `setupApproval()` call on the next line and warned about a setup that was about to arrive. The check now waits for that script to finish; with no setup at all, it still warns once.
