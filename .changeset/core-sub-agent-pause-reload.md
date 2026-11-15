---
'@aparte/core': minor
---

A pause on a sub-agent's call now survives a reload: `resumeDeferred` asks it again under the sub-agent's name, and the run resumes with the answer.

Do you have to touch your code? No. A storage adapter that saves the message as it is keeps the new field; one that copies chosen fields should copy `deferredCalls` too.

- **What was wrong.** An agent elsewhere (an AG-UI agent, a server loop of your own) can pause on a call its sub-agent made. That call has no row in the reply, so nothing the conversation saved said a call was waiting: after a reload, `resumeDeferred` found no pause, the question was never asked again, and the agent kept waiting for an answer.
- **What the reply keeps.** `AparteMessage.deferredCalls`, a list of `AparteDeferredCall` — `{ toolCallId, name, input, reason, agentId, agentName, ticket }` — written when the run pauses, before `aparte-message-paused`, so the conversation saved then has it. It names nothing of a plugin: the call, why it waits, the sub-agent's id and the name it was announced with, the server's ticket. It is removed once the pause is answered, and closed by a Stop or a new message, like a row's `deferred`.
- **On a reload.** `resumeDeferred` resumes the reply's own paused calls and these together, each sub-agent call with its `agentId`, asked under its sub-agent's name (`Allow read_file for Researcher?`), and an `approvalResolver` receives `call.agent`. The call that opened the sub-agent stays open across the load, so the resume hands it back to the agent unanswered rather than "stopped".
