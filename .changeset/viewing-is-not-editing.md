---
'@aparte/core': patch
---

Opening a conversation and leaving it, or moving between the versions of a reply (‹1/2›), no longer moves it to "Today" in the conversation list: `updatedAt` changes only when a message does.

Two comparisons counted looking as editing. The viewport hands the messages back stamped (each segment with its message id, index and `isStreaming: false`, a call nobody can answer any more closed) and with keys in another order, and the manager compared raw JSON — so a record the app or a server wrote without those stamps read as changed the moment it was opened. Both sides now go through the same adoption step, keys sorted. And the comparison read the active path only, so a branch switch counted as new content; with a tree on both sides it now reads every branch, and the branch shown is saved without dating the conversation.
