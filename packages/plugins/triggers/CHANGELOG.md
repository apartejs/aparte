# @aparte/plugin-triggers

## 1.3.0

## 1.2.0

## 1.1.2

## 1.1.1

## 1.1.0

### Minor Changes

- 855778c: New package: `/` commands, `@` mentions and any other trigger character in the composer.

  Write `<aparte-triggers>` inside `<aparte-composer>` and give it the triggers you want: static lists or a search function with `AbortSignal`, groups, submenus of any depth, your own row rendering. A row runs something, inserts text, or inserts a pill that sends a text of its own. The focus stays in the field; arrows, Enter, Tab and Escape act on the menu, in right to left too, and a phone gets one panel at a time.

  `@aparte/plugin-triggers/commands` adds `/new`, `/stop`, `/retry` and `/copy` when you ask for them.
