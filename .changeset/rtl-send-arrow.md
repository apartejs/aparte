---
"@aparte/core": patch
---

In a right-to-left composer, the send button's arrow now points to the left. The stop square and the submit check are not turned.

The paper plane pointed right whatever the direction, where right-to-left apps turn it toward the start of the line, as the version arrows already were. The button now says which act it shows (`data-act="send"`, `"submit"` or `"stop"`), and only the send glyph is mirrored, whichever icon `getIcon('send')` returns: a mirrored check reads as a mistake.
