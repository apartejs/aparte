# @aparte/runner-n8n

Put aparté on an **[n8n](https://n8n.io)** chat workflow. The workflow's agent runs in n8n, with
its model, its tools and its memory; aparté draws the chat on your page, streamed when the Chat
Trigger streams — in place of n8n's own chat widget.

```bash
npm install @aparte/runner-n8n @aparte/core
```

```ts
import { AparteClient } from '@aparte/core';
import { createN8nRunner } from '@aparte/runner-n8n';

new AparteClient({
    streamRunner: createN8nRunner({ webhookUrl: 'https://your-n8n.example.com/webhook/<id>/chat' }),
}).start();
```

- **The workflow**: a Chat Trigger made publicly available, with your site in its *Allowed Origins
  (CORS)*. Set its Response Mode to *Streaming* (and leave streaming on in the AI Agent) to see the
  answer arrive as it is written, or to *When Last Node Finishes* for a whole answer.
- **Memory** is n8n's, per session: each turn sends only the new message. Give `sessionId` the
  conversation's id when your app has several, or keeps one across reloads.
- **Images** the person attaches go to the workflow as files, as the Chat Trigger takes uploads.
- **Errors** say what to change: an inactive workflow, a trigger that streams while its agent does
  not, a workflow that answers through response nodes, a proxy that timed out.

No n8n SDK is pulled in: the answer is plain JSON, parsed here, with `@aparte/core` as the only peer
dependency.

> Part of the [aparté](https://github.com/apartejs/aparte) monorepo. ESM-only.
> See **Providers → n8n** in the docs.
