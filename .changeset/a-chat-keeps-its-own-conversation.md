---
'@aparte/core': minor
---

A chat's first message now always starts a conversation of its own, even when another chat on the same conversation manager has one open or is creating one.

Nothing to change in your code. With several chats on one manager, a chat whose first message was sent while another chat had a conversation open saved that message into the other chat's conversation, marked the other chat's row in the list as answering, and told the client the turn belonged to it. Two chats sending their first message at the same moment could end up in one conversation. Each chat now reads only its own conversation: the one it opened, or the one its first message is creating, which the controller exposes as `pendingId` until `activeId` holds it.

The manager still has one `activeId`, and it still names the conversation the last chat to move opened. It does not drive a chat: calling `manager.select()` or `manager.createNew()` yourself changes no chat's transcript. To open a conversation in a chat, dispatch `aparte-conversation-select` with that chat's id as `targetId`, set its `conversationId`, or call `setConversationId()` on it.
