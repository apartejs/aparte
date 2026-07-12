---
title: "Theming & Design System"
editUrl: false
---

# Theming & Design System

Aparte is **100% CSS-driven** — there is no JS theme logic. Every color, radius, size
and spacing token is a CSS custom property with the `--aparte-` prefix. You theme Aparte
by overriding those variables in your own stylesheet; you switch light/dark with a
single attribute.

## How it works

Override any `--aparte-*` variable on `:root` (or on any ancestor of the chat, to scope
it). Every component reads from these variables — nothing is hard-coded.

```css
:root {
  --aparte-primary: #6366f1;
  --aparte-bg: #ffffff;
  --aparte-text: #1f2937;
  --aparte-surface-1: #ffffff;   /* bubbles */
  --aparte-surface-2: #f3f4f6;   /* code blocks */
  --aparte-border: #e5e7eb;
}
```

> Aparte ships an unstyled/neutral default. Skin packages (`@aparte/theme-claude`,
> `@aparte/theme-openai`, …) are just curated sets of these variables — you can build
> your own the same way.

## Dark mode

Set `data-aparte-theme="dark"` on any ancestor (or `<html>`). The stylesheet ships a
complete dark override for every token; you only re-declare the ones you want to
change.

```html
<div data-aparte-theme="dark">
  <aparte-chat-viewport>…</aparte-chat-viewport>
</div>
```

```css
:root { --aparte-bg: #ffffff; --aparte-text: #1f2937; }
[data-aparte-theme="dark"] { --aparte-bg: #0f172a; --aparte-text: #f1f5f9; }
```

For automatic OS-preference switching, mirror the dark tokens under
`@media (prefers-color-scheme: dark)` yourself, or toggle `data-aparte-theme` from a
tiny inline script — Aparte stays out of it.

## State hooks you can theme

Some states are exposed as attributes/classes so you can style them without JS:

- **Errored bubble** — the bubble sets `data-error` on its `.aparte-message` while it
  holds an error segment. Theme the whole errored turn:

  ```css
  .aparte-message[data-error] { /* e.g. a red rail */ }
  ```

- **Streaming bubble** — `.aparte-message[data-streaming]` while a reply streams.
- **Theme scope** — `[data-aparte-theme="dark"]` / `[data-aparte-theme="light"]`.

Deeper structural customization (replacing markup, not just colors) is a separate
surface — see [CUSTOMIZATION.md](./CUSTOMIZATION.md).

## Typography & spacing

The default font is the system stack (`system-ui, -apple-system, sans-serif`) for a
zero-byte, native feel — override `--aparte-font-family` (and `--aparte-code-font-family`)
to change it. Spacing follows an 8px grid.

---

## Variable reference

Every `--aparte-*` token defined by `src/styles/aparte.css`, grouped as in the source.
"Default (light)" is the `:root` value; "Dark override" is the value under
`[data-aparte-theme="dark"]` (— when a token isn't overridden there).

> Generated from `src/styles/aparte.css` (the source of truth). 157 tokens across
> 32 categories; "Dark override" is the value under `[data-aparte-theme="dark"]`
> (`—` when the token isn't overridden there). Values shown verbatim, including
> `var(--other)` aliases.

### Base Colors
| Variable | Default (light) | Dark override | Purpose |
|---|---|---|---|
| `--aparte-primary` | `#6366f1` | `#818cf8` | Primary brand/accent color |
| `--aparte-primary-hover` | `#4f46e5` | `#6366f1` | Primary color hover state |
| `--aparte-secondary` | `#9ca3af` | — | Secondary accent color |
| `--aparte-neutral` | `#6b7280` | — | Neutral base color |

### Backgrounds & Surfaces
| Variable | Default (light) | Dark override | Purpose |
|---|---|---|---|
| `--aparte-bg` | `#ffffff` | `#0f172a` | Page/app background |
| `--aparte-surface-1` | `#ffffff` | `#1e293b` | Bubbles, cards |
| `--aparte-surface-2` | `#f3f4f6` | `#334155` | Code blocks, headers |
| `--aparte-surface-3` | `#e5e7eb` | `#475569` | Skeletons, disabled |

### Text
| Variable | Default (light) | Dark override | Purpose |
|---|---|---|---|
| `--aparte-text` | `#1f2937` | `#f1f5f9` | Primary text color |
| `--aparte-text-muted` | `#6b7280` | `#94a3b8` | Secondary/muted text color |
| `--aparte-text-inverse` | `#ffffff` | `#0f172a` | Text color on filled bg |

### Borders
| Variable | Default (light) | Dark override | Purpose |
|---|---|---|---|
| `--aparte-border` | `#e5e7eb` | `#334155` | Default border color |
| `--aparte-border-focus` | `var(--aparte-primary)` | — | Focus-state border color |

### Status Colors
| Variable | Default (light) | Dark override | Purpose |
|---|---|---|---|
| `--aparte-info` | `#3b82f6` | — | Info status color |
| `--aparte-success` | `#10b981` | — | Success status color |
| `--aparte-warning` | `#f59e0b` | — | Warning status color |
| `--aparte-error` | `#ef4444` | — | Error status color |

### Radius scale
| Variable | Default (light) | Dark override | Purpose |
|---|---|---|---|
| `--aparte-radius-xs` | `2px` | — | Extra-small corner radius |
| `--aparte-radius-sm` | `4px` | — | Small corner radius |
| `--aparte-radius-md` | `6px` | — | Medium corner radius |
| `--aparte-radius-lg` | `8px` | — | Large corner radius |
| `--aparte-radius-xl` | `12px` | — | Extra-large corner radius |
| `--aparte-radius-full` | `9999px` | — | Fully rounded (pill/circle) |

### Component-specific radius (overridable per app)
| Variable | Default (light) | Dark override | Purpose |
|---|---|---|---|
| `--aparte-radius-input` | `var(--aparte-radius-lg)` | — | Chat input corner radius |
| `--aparte-radius-input-footer` | `var(--aparte-radius-lg)` | — | Input footer corner radius |
| `--aparte-radius-send-btn` | `var(--aparte-radius-md)` | — | Send button corner radius |
| `--aparte-radius-action-btn` | `var(--aparte-radius-sm)` | — | Action button corner radius |
| `--aparte-radius-select` | `var(--aparte-radius-md)` | — | Select dropdown corner radius |
| `--aparte-radius-avatar` | `var(--aparte-radius-md)` | — | Avatar corner radius |
| `--aparte-radius-bubble` | `var(--aparte-radius-lg)` | — | Message bubble corner radius |
| `--aparte-radius-code` | `var(--aparte-radius-lg)` | — | Code block corner radius |
| `--aparte-radius-thinking` | `var(--aparte-radius-lg)` | — | Thinking segment corner radius |
| `--aparte-radius-terminal` | `var(--aparte-radius-lg)` | — | Terminal block corner radius |
| `--aparte-radius-error` | `var(--aparte-radius-md)` | — | Error segment corner radius |
| `--aparte-radius-file-tree` | `var(--aparte-radius-lg)` | — | File tree corner radius |

### Typography
| Variable | Default (light) | Dark override | Purpose |
|---|---|---|---|
| `--aparte-font-family` | `system-ui, -apple-system, sans-serif` | — | Base UI font family |
| `--aparte-code-font-family` | `ui-monospace, 'Cascadia Code', 'JetBrains Mono', 'Geist Mono', SFMono-Regular, Consolas, 'Liberation Mono', monospace` | — | Monospace font for code |

### Messages
| Variable | Default (light) | Dark override | Purpose |
|---|---|---|---|
| `--aparte-message-gap` | `12px` | — | Gap between messages |
| `--aparte-message-padding` | `16px 12px` | — | Message row padding |
| `--aparte-message-max-width` | `800px` | — | Message column max width |

### Bubbles (opt-in — default is a transparent row)
| Variable | Default (light) | Dark override | Purpose |
|---|---|---|---|
| `--aparte-bubble-bg-user` | `transparent` | — | User bubble background |
| `--aparte-bubble-bg-assistant` | `transparent` | — | Assistant bubble background |
| `--aparte-bubble-text-user` | `var(--aparte-text)` | — | User bubble text color |
| `--aparte-bubble-text-assistant` | `var(--aparte-text)` | — | Assistant bubble text color |
| `--aparte-bubble-padding` | `0` | — | Bubble inner padding |
| `--aparte-bubble-radius` | `0` | — | Bubble corner radius |

### Aliases (used by segment renderers — artifact card, tool pill)
| Variable | Default (light) | Dark override | Purpose |
|---|---|---|---|
| `--aparte-surface` | `var(--aparte-surface-1)` | — | Alias for surface-1 |
| `--aparte-surface-hover` | `var(--aparte-surface-2)` | — | Alias for surface-2 hover |
| `--aparte-text-secondary` | `var(--aparte-text-muted)` | — | Alias for muted text |
| `--aparte-accent` | `var(--aparte-primary)` | — | Alias for primary color |
| `--aparte-success-border` | `var(--aparte-success)` | — | Success border alias |
| `--aparte-success-surface` | `color-mix(in oklch, var(--aparte-success) 12%, transparent)` | — | Tinted success surface |
| `--aparte-error-border-soft` | `var(--aparte-error)` | — | Soft error border alias |
| `--aparte-error-surface` | `color-mix(in oklch, var(--aparte-error) 12%, transparent)` | — | Tinted error surface |

### Attachments
| Variable | Default (light) | Dark override | Purpose |
|---|---|---|---|
| `--aparte-attachment-chip-bg` | `var(--aparte-surface-2)` | — | Attachment chip background |
| `--aparte-attachment-chip-border` | `var(--aparte-border)` | — | Attachment chip border |
| `--aparte-attachment-chip-radius` | `var(--aparte-radius-sm)` | — | Attachment chip corner radius |
| `--aparte-attachment-chip-color` | `var(--aparte-text)` | — | Attachment chip text color |
| `--aparte-attachment-image-size` | `72px` | — | Attachment thumbnail size |

### Action Bar
| Variable | Default (light) | Dark override | Purpose |
|---|---|---|---|
| `--aparte-action-bar-gap` | `4px` | — | Gap between action buttons |
| `--aparte-action-bar-btn-size` | `28px` | — | Action button size |
| `--aparte-action-bar-btn-color` | `var(--aparte-text-muted)` | — | Action button icon color |
| `--aparte-action-bar-btn-hover-bg` | `var(--aparte-surface-2)` | — | Action button hover background |
| `--aparte-action-bar-btn-hover-color` | `var(--aparte-text)` | — | Action button hover color |

### Branch Picker
| Variable | Default (light) | Dark override | Purpose |
|---|---|---|---|
| `--aparte-branch-picker-gap` | `4px` | — | Gap between branch controls |
| `--aparte-branch-picker-btn-color` | `var(--aparte-text-muted)` | — | Branch nav button color |
| `--aparte-branch-picker-btn-hover-color` | `var(--aparte-text)` | — | Branch nav hover color |
| `--aparte-branch-picker-label-size` | `12px` | — | Branch label font size |
| `--aparte-branch-picker-label-color` | `var(--aparte-text-muted)` | — | Branch label text color |

### Avatars
| Variable | Default (light) | Dark override | Purpose |
|---|---|---|---|
| `--aparte-avatar-size` | `32px` | — | Avatar diameter |
| `--aparte-avatar-radius` | `var(--aparte-radius-avatar)` | — | Avatar corner radius |
| `--aparte-avatar-bg-user` | `var(--aparte-primary)` | — | User avatar background |
| `--aparte-avatar-text-user` | `var(--aparte-text-inverse)` | — | User avatar initials color |
| `--aparte-avatar-bg-assistant` | `var(--aparte-success)` | — | Assistant avatar background |
| `--aparte-avatar-text-assistant` | `var(--aparte-text-inverse)` | — | Assistant avatar initials color |
| `--aparte-avatar-image-user` | `none` | — | User avatar image override |
| `--aparte-avatar-image-assistant` | `none` | — | Assistant avatar image override |
| `--aparte-avatar-image-size` | `90%` | — | Avatar image background-size |

### Text Sizes
| Variable | Default (light) | Dark override | Purpose |
|---|---|---|---|
| `--aparte-name-font-size` | `14px` | — | Sender name font size |
| `--aparte-name-color` | `var(--aparte-text)` | `#f3f4f6` | Sender name text color |
| `--aparte-timestamp-font-size` | `12px` | — | Timestamp font size |
| `--aparte-timestamp-color` | `var(--aparte-text-muted)` | `#64748b` | Timestamp text color |
| `--aparte-content-font-size` | `15px` | — | Message content font size |
| `--aparte-content-color` | `var(--aparte-text)` | `#e5e7eb` | Message content text color |

### Input (chat)
| Variable | Default (light) | Dark override | Purpose |
|---|---|---|---|
| `--aparte-input-bg` | `var(--aparte-surface-1)` | `#1e293b` | Chat input background |
| `--aparte-input-border` | `var(--aparte-border)` | `#374151` | Chat input border color |
| `--aparte-input-text` | `var(--aparte-text)` | `#e5e7eb` | Chat input text color |
| `--aparte-input-placeholder` | `var(--aparte-text-muted)` | `#64748b` | Chat input placeholder color |
| `--aparte-input-focus-border` | `var(--aparte-primary)` | — | Chat input focus border |

### Status Indicator
| Variable | Default (light) | Dark override | Purpose |
|---|---|---|---|
| `--aparte-status-color` | `var(--aparte-text-muted)` | `#94a3b8` | Typing status color |
| `--aparte-status-bg` | `transparent` | — | Status indicator background |
| `--aparte-status-dot-size` | `6px` | — | Typing dot size |
| `--aparte-status-font-size` | `13px` | — | Status text font size |

### Thinking Segment
| Variable | Default (light) | Dark override | Purpose |
|---|---|---|---|
| `--aparte-thinking-border` | `var(--aparte-border)` | `#334155` | Thinking segment border |
| `--aparte-thinking-bg` | `var(--aparte-surface-2)` | `#1e293b` | Thinking segment background |
| `--aparte-thinking-text` | `var(--aparte-text-muted)` | `#94a3b8` | Thinking header text color |
| `--aparte-thinking-content` | `var(--aparte-text)` | `#e5e7eb` | Thinking content text color |
| `--aparte-thinking-content-bg` | `var(--aparte-surface-1)` | `#0f172a` | Thinking content background |

### Code Blocks
| Variable | Default (light) | Dark override | Purpose |
|---|---|---|---|
| `--aparte-code-bg` | `var(--aparte-surface-1)` | `#1e293b` | Code block background |
| `--aparte-code-header-bg` | `var(--aparte-surface-2)` | `#334155` | Code block header background |
| `--aparte-code-border` | `var(--aparte-border)` | `#475569` | Code block border color |
| `--aparte-code-header-text` | `var(--aparte-text-muted)` | `#94a3b8` | Code header text color |

### Terminal
| Variable | Default (light) | Dark override | Purpose |
|---|---|---|---|
| `--aparte-terminal-bg` | `#1e293b` | — | Terminal block background |
| `--aparte-terminal-text` | `#e2e8f0` | — | Terminal command text color |
| `--aparte-terminal-icon` | `#64748b` | — | Terminal icon color |
| `--aparte-terminal-hover` | `#334155` | — | Terminal button hover background |
| `--aparte-terminal-running` | `#22c55e` | — | Terminal running-state color |
| `--aparte-terminal-output-bg` | `#0f172a` | — | Terminal output background |
| `--aparte-terminal-output-text` | `#94a3b8` | — | Terminal output text color |

### Progress
| Variable | Default (light) | Dark override | Purpose |
|---|---|---|---|
| `--aparte-progress-bar-bg` | `var(--aparte-surface-3)` | `#334155` | Progress bar track background |
| `--aparte-progress-bar-fill` | `var(--aparte-primary)` | — | Progress bar fill color |
| `--aparte-progress-label` | `var(--aparte-text)` | `#e5e7eb` | Progress label text color |

### Scroll-to-bottom button
| Variable | Default (light) | Dark override | Purpose |
|---|---|---|---|
| `--aparte-scroll-btn-size` | `36px` | — | Scroll button size |
| `--aparte-scroll-btn-bg` | `var(--aparte-surface-1)` | — | Scroll button background |
| `--aparte-scroll-btn-color` | `var(--aparte-text)` | — | Scroll button icon color |
| `--aparte-scroll-btn-border` | `var(--aparte-border)` | — | Scroll button border color |
| `--aparte-scroll-btn-shadow` | `0 2px 8px rgba(0, 0, 0, 0.12)` | `0 2px 12px rgba(0, 0, 0, 0.35)` | Scroll button shadow |
| `--aparte-scroll-btn-hover-bg` | `var(--aparte-surface-2)` | — | Scroll button hover background |

### File Tree
| Variable | Default (light) | Dark override | Purpose |
|---|---|---|---|
| `--aparte-file-tree-bg` | `var(--aparte-surface-1)` | `#1e293b` | File tree background |
| `--aparte-file-tree-border` | `var(--aparte-border)` | `#334155` | File tree border color |
| `--aparte-file-tree-header-bg` | `var(--aparte-surface-2)` | `#0f172a` | File tree header background |
| `--aparte-file-tree-hover` | `var(--aparte-surface-2)` | `#334155` | File tree row hover background |
| `--aparte-file-tree-title` | `var(--aparte-text-muted)` | `#94a3b8` | File tree title text color |

### Error segment (and `[data-error]` theming)
| Variable | Default (light) | Dark override | Purpose |
|---|---|---|---|
| `--aparte-error-bg` | `#fef2f2` | `#2d1b1b` | Error segment background |
| `--aparte-error-border` | `#fecaca` | `#7f1d1d` | Error segment border color |
| `--aparte-error-solid` | `#dc2626` | `#f87171` | Error accent/icon color (also the `[data-error]` avatar ring) |
| `--aparte-error-text` | `#991b1b` | `#fca5a5` | Error message text color |
| `--aparte-error-title` | `#7f1d1d` | `#fecaca` | Error title text color |

### Prose (segment content)
| Variable | Default (light) | Dark override | Purpose |
|---|---|---|---|
| `--aparte-prose-p-margin` | `0.4em 0` | — | Paragraph margin |
| `--aparte-prose-h1-size` | `1.4em` | — | H1 heading font size |
| `--aparte-prose-h2-size` | `1.25em` | — | H2 heading font size |
| `--aparte-prose-h3-size` | `1.1em` | — | H3 heading font size |
| `--aparte-prose-list-indent` | `1.5em` | — | List indent |
| `--aparte-prose-list-margin` | `0.4em 0` | — | List margin |
| `--aparte-prose-li-margin` | `0.15em 0` | — | List item margin |
| `--aparte-prose-blockquote-border` | `var(--aparte-border)` | `#475569` | Blockquote left border color |
| `--aparte-prose-code-bg` | `var(--aparte-surface-2)` | `#334155` | Inline code background |

### Viewport & content
| Variable | Default (light) | Dark override | Purpose |
|---|---|---|---|
| `--aparte-viewport-padding` | `16px` | — | Viewport padding |
| `--aparte-content-line-height` | `1.7` | — | Message content line height |
| `--aparte-cursor-color` | `var(--aparte-primary)` | — | Streaming cursor color |

### Composer input
| Variable | Default (light) | Dark override | Purpose |
|---|---|---|---|
| `--aparte-input-font-size` | `14px` | — | Composer input font size |
| `--aparte-input-line-height` | `1.5` | — | Composer input line height |
| `--aparte-input-padding-x` | `12px` | — | Composer input horizontal padding |
| `--aparte-input-padding-y` | `10px` | — | Composer input vertical padding |

### Conversation List
| Variable | Default (light) | Dark override | Purpose |
|---|---|---|---|
| `--aparte-conv-list-gap` | `2px` | — | Gap between conversation items |
| `--aparte-conv-item-padding` | `7px 10px` | — | Conversation item padding |
| `--aparte-conv-item-radius` | `var(--aparte-radius-md)` | — | Conversation item corner radius |
| `--aparte-conv-item-color` | `var(--aparte-text-muted)` | — | Conversation item text color |
| `--aparte-conv-item-color-active` | `var(--aparte-text)` | — | Active item text color |
| `--aparte-conv-item-bg-hover` | `var(--aparte-surface-3)` | `#334155` | Conversation item hover background |
| `--aparte-conv-item-bg-active` | `var(--aparte-surface-3)` | `#334155` | Active conversation item background |
| `--aparte-conv-item-font-size` | `0.8125rem` | — | Conversation item font size |
| `--aparte-conv-item-font-weight-active` | `500` | — | Active item font weight |
| `--aparte-conv-delete-color` | `var(--aparte-text-muted)` | `#64748b` | Delete button icon color |
| `--aparte-conv-delete-bg-hover` | `var(--aparte-error)` | — | Delete button hover background |
| `--aparte-conv-delete-color-hover` | `var(--aparte-text-inverse)` | — | Delete button hover icon color |
| `--aparte-conv-delete-radius` | `var(--aparte-radius-sm)` | — | Delete button corner radius |

> A few tokens are **consumed with a `var(--x, fallback)` default but never assigned
> in this stylesheet** — they exist only for you to define: `--aparte-surface-4`,
> `--aparte-composer-control-size`, `--aparte-conv-archive-*`. `--aparte-fw-spacer` is set
> at runtime (framework-managed viewport spacer).
