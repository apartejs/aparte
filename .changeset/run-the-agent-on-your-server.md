---
"@aparte/core": patch
---

New: run the agent loop on your server. `createAparteAgentHandler` runs it next to your tools and streams it; `createAgentStreamRunner` plugs `AparteClient` into it — tool rows, Stop, the approval panel and your approval policy work as they do in the browser, and a user can leave in the middle of an approval and answer it when they come back.

Until now a server with its own tools could only drive the chat display-only: the message, the segments, closing the turn and four lifecycle events, by hand. The handler pauses the loop on a call that needs a person, or on a tool the browser runs (`ask_user`), and ends the stream with a signed continuation ticket; the page asks — the same panel, the same policy — and resumes with the answer, in the same bubble, under one pair of lifecycle events. Nothing is stored on the server: the paused call lives in the conversation you already save (`AparteToolCallSegment.deferred`), and a conversation that loads with one resumes on its own — the conversation controller now dispatches `aparte-conversation-loaded`, and `client.resumeDeferred()` is there for a host that loads conversations another way. A message sent instead of an answer closes the paused call.

The server decides which calls need a person; the page's policy answers when it has an opinion, and otherwise the person is asked. The ticket makes the server run only the calls it emitted, for the reply it paused; it does not make a tool's input trustworthy, and it is not single-use unless you pass `onTicket`. An approval `payload` is dropped unless the tool accepts one. Guide: Run the agent loop on your server.
