---
'@aparte/core': minor
'@aparte/locales': minor
---

A message the server refuses for its size (HTTP 413) now reads "This message is too large to send. Remove a file or send a shorter one." instead of promising a retry, and is left out of later requests.

`AparteError.codeForStatus` had no case for 413, so the error fell back to a failing provider: "Try again in a moment", and a retry sends the same bytes. It is easy to hit: nginx refuses a body over 1 MB by default, PHP one over 8 MB, and an image travels in base64. It has its own code now, `USAGE_TOO_LARGE`, its own sentence, `errorTooLarge`, in the nine languages of `@aparte/locales`, and it joins the codes whose message is left out of every later request: a long pasted text refused for its size no longer goes out again with the next message and takes it down too. (apartejs/aparte#294)
