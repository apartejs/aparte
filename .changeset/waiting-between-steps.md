---
"@aparte/core": patch
---

The waiting dots show again between a finished tool call and the model's next words.

They showed only until the first segment arrived, so after a tool row read "Done" the reply sat still while the model worked on its next turn. They show while the reply streams and its last segment is a call that has finished or that the app hides, and leave as soon as the next step writes — never while a person is being asked.
