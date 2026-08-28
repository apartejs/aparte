# @aparte/plugin-approval

Approval **modes** for [aparté](https://github.com/apartejs/aparte) tool calls — `plan`, `ask`, `auto-edit`,
`auto` — from a classification of your own tool names, with a `<aparte-approval-mode>` switch for the
composer's toolbar. It decides; it never executes anything and stores nothing.

```bash
npm install @aparte/plugin-approval @aparte/core
```

```ts
import { aparteGlobalConfig } from '@aparte/core';
import { setupApproval } from '@aparte/plugin-approval';

const approval = setupApproval({
  classify: {
    read:  ['read_file', 'search', /^list_/],
    write: ['write_file', 'edit_file'],
    exec:  ['run_command'],
  },
  mode: 'ask',
}, aparteGlobalConfig);  // the config last, like every setup*: it defaults to the global
approval.setMode('plan');   // or let the person switch it:
```

```html
<aparte-composer-toolbar>
  <aparte-approval-mode></aparte-approval-mode>
</aparte-composer-toolbar>
```

**The table** — `plan` runs read-only tools and refuses the rest with a sentence the model reads
(so it describes what it would do instead); `ask` asks before every write or execution, through the
same composer panel a `needsApproval` tool uses; `auto-edit` lets writes through and asks before an
execution; `auto` never asks. A tool in no list keeps its own `needsApproval`.

Under the hood it is one core seam: `config.setApprovalPolicy()`, a per-call policy the client's
approval channel consults before asking. `@aparte/core` is the only **peer dependency**.

> ESM-only. Part of the aparté monorepo.
