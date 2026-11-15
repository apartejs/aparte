---
'@aparte/plugin-approval': patch
---

`onApprovalModeChange` (and any listener typed from `approvalModeElement`) now receives `ApprovalModeChangeDetail`, whose `mode` and `previousMode` are `ApprovalMode`; drop the guard or cast you used to index a `Record<ApprovalMode, …>`.

The switch and the `/approval` command only ever send one of the four modes, but the element's spec typed the detail as core's `AparteApprovalModeChangeEventDetail`, where both are `string`, so `createAparteElement(approvalModeElement)` called back with a `string`. `ApprovalModeChangeDetail` is new, exported from the plugin, and extends core's type, so a listener on the DOM event map keeps compiling. Core's type stays `string`, for a host that registers modes of its own.
