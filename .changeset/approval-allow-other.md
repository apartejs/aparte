---
"@aparte/core": patch
"@aparte/runner-n8n": patch
---

`freeText` on an approval request is renamed `allowOther`, the name a question's free-text option already has. Replace `freeText: false` with `allowOther: false`.

Published in 0.27.3 an hour before: one idea, "may the person answer in words", now has one name on both panels. Same default (`true`), same meaning; `setupN8nButtons` passes it for n8n's Block User Input.
