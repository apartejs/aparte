/**
 * @aparte/n8n-chat — n8n's chat widget, drawn by aparté.
 *
 * `createChat()` takes `@n8n/chat`'s options and mounts the same widget — a button in the
 * corner, or a chat that fills its target — on an n8n Chat Trigger, through
 * `@aparte/runner-n8n`. `style.css` is aparté's stylesheet with the n8n theme;
 * `theme.css` is the theme alone, for a chat you compose yourself.
 */
export { createChat } from './create-chat.js';
export type { Chat, ChatOptions } from './create-chat.js';
export type { ChatStrings } from './strings.js';
