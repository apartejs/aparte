---
"@aparte/plugin-artifacts": patch
---

A refused, stopped or failed `create_artifact` shows "Not created" instead of a card with Download; one awaiting approval shows that it is waiting.

The card drew from the model's input whatever the call became, so the person was handed the result of an action they had just refused. A call that ran shows the card; a pending call keeps it (the handler answers at once); one waiting for a decision shows a quiet block; one that never ran shows its badge, its title and "Not created" (`artifactNotCreated`), with no buttons.
