---
"@aparte/runner-n8n": patch
---

A Chat node's buttons are now shown only when their links resume the running execution, and an n8n error frame no longer puts the workflow's own words in front of the person.

Buttons are shown when every link, resolved once against `webhookUrl`, is http(s), on the webhook's origin, and has exactly the shape n8n sends: `<mount>/webhook-waiting/<execution id>/<node id>?approved=true|false&signature=<64 hex digits>`, with no other path segment, query parameter or fragment. The mount is what sits in front of the Chat Trigger's `/webhook/<id>/chat` at the end of `webhookUrl` (`https://site/n8n/webhook/abc/chat` takes `/n8n/webhook-waiting/…`; a base path that itself holds a `/webhook` segment is read whole). A path that only holds the waiting segment further down, such as `/rest/x/webhook-waiting/<id>`, and a waiting link with no signature are not accepted. An instance that moved the waiting endpoint (`N8N_ENDPOINT_WEBHOOK_WAIT`), or whose `webhookUrl` does not end in `/webhook/<id>/chat`, sets the `waitingPrefix` option (`'/n8n/webhook-waiting'`); the links must then begin with `<prefix>/<execution id>/<node id>` and have the same query. If any link fails, no button is shown, `onWarning` is told (and names `waitingPrefix`), and the question is drawn as text.

On n8n 2.x a Chat node's message travels as plain text, so an answer written by a model could look like a buttons frame, and its relative link would be fetched from the host page. The ticket now stores the resolved absolute link, that link is what is fetched, and it is checked again when the turn resumes. A ticket whose links are not all strings is read as a new message.

An answer that looks like n8n handing over to the chat socket (`{ "executionStarted": true, … }`) is now accepted only in the shape n8n sends: `application/json`, with exactly the fields `executionStarted`, `executionId` (a number) and `resumeToken`. Anything else carrying that field is shown as the workflow's answer. A workflow that returns a model's text as its body (a Respond to Webhook node set to Text) could otherwise name the execution and the token that the page opens its socket on.

An `error` frame on the socket now fails the turn with "The n8n workflow failed."; the frame's message is passed to `onWarning` instead of being shown.

The same holds for an `error` frame in the HTTP answer or stream: the turn fails with "The n8n workflow failed." and the frame's message goes to `onWarning`. A body that is only text cannot be told from an error frame, so a workflow answering with a model's text could write one (with a `begin` frame before it) and have its words shown as the failure. The error text of a failed n8n execution is now in the console, not in the chat.
