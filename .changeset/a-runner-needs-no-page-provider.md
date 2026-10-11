---
"@aparte/core": patch
---

Fixed: with `createAgentStreamRunner` or an AG-UI runner, the page no longer has to register a provider and select a model it never calls (#100). Set `defaultModel` on `createAparteAgentHandler`: when the page names neither, the handler runs its only provider on that model.

Before, `AparteClient` dropped every send with `Send dropped: no model is selected` unless the page registered a provider whose id matched a key of the server's `providers`. A retry or an edit did nothing, without a word. The server-loop guide's browser snippet left this out, so following it as written sent nothing.

Now a runner other than the page's own loop (`runStreamAgent`) needs no provider in the page. A provider and model the page names anyway (`setModelConfig`, a model selector) travel with the turn, registered or not, and the server uses them. With several providers, the handler answers 400 and asks the page to name one. A stub provider registered as a workaround keeps working and can be removed.
