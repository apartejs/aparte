---
"@aparte/n8n-chat": minor
---

New package: `@aparte/n8n-chat` replaces n8n's chat widget from the same call — `createChat({ webhookUrl })` takes `@n8n/chat`'s options and mounts the widget on your Chat Trigger, a button in the corner or a chat that fills its target. One `<link>` (`@aparte/n8n-chat/style.css`) and one import, from a CDN or a bundler.

It keeps what a page already relies on: the option names and defaults, the session where n8n's widget keeps it (`localStorage` key `n8n-chat/sessionId`, so a visitor keeps their conversation across the switch), the history shown again on load, files sent as `files`, and the `--chat--*` variables, which the n8n theme reads — a page that restyled n8n's widget keeps its colors.

What it adds: `createChat` returns a handle (`open`, `close`, `toggle`, `send`, `reset`, `destroy`); `reset()` starts a real new conversation with a new session; French ships beside English; the history leaves out a tool's call and its result instead of drawing them as raw JSON; a workflow whose last node returns no `output` says so instead of printing its JSON; the window and its button are reachable by keyboard and named for a screen reader, the title is not an `h1`, nothing leaks into the page's styles, and there is a dark scheme. `theme.css` is the theme alone, for a chat composed with the framework components.
