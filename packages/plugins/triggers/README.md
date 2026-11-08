# @aparte/plugin-triggers

Slash commands, `@` mentions and any other trigger character in the [aparté](https://apartejs.dev) composer: static or searched lists, groups, submenus, pills that send a text of their own, and commands other plugins add.

```bash
npm install @aparte/plugin-triggers
```

```html
<aparte-composer>
  <aparte-triggers></aparte-triggers>
  <aparte-composer-input></aparte-composer-input>
  <aparte-composer-send></aparte-composer-send>
</aparte-composer>
```

```ts
import '@aparte/plugin-triggers';
import { setupCommands } from '@aparte/plugin-triggers/commands';

setupCommands(); // /new, /stop, /retry, /copy

document.querySelector('aparte-triggers')!.triggers = [
  { char: '/', at: 'message', commands: { exclude: ['copy'], override: { retry: { label: 'Again' } } } },
  { char: '@', at: 'word', kind: 'mention', items: (query, { signal }) => searchPeople(query, signal) },
  { char: '#', items: [{ id: 'bug', label: 'bug' }, { id: 'idea', label: 'idea' }] },
];
```

`@aparte/plugin-compaction` answers with `/compact`, `@aparte/plugin-model-selector` with `/model` and `@aparte/plugin-approval` with `/approval`. None of them depends on this package: they answer an event, and with no menu on the page nothing asks.

A plugin or an app adds its own command the same way:

```ts
window.addEventListener('aparte-collect-commands', (event) => {
  event.detail.add({ id: 'export', description: 'Download this conversation', run: () => download() });
});
```

Full guide: [Commands and mentions](https://apartejs.dev/guides/commands-and-mentions/).

MIT
