---
'@aparte/plugin-approval': patch
---

`createApprovalPolicy` is typed as ruling at once, so `policy(call)?.verdict` reads without an await.

A core approval policy may now answer with a promise (apartejs/aparte#291), and the factory's return type used to be that wider policy type, so reading the mode's ruling by hand stopped typechecking. The policy it builds never was asynchronous; its type now says so, and it is still accepted by `setApprovalPolicy`.
