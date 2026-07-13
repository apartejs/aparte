// Components barrel export
export { AparteChat } from './chat/index.js';
export { AparteChatBubble, populateBubbleFromMessage } from './bubble/index.js';
export type { SyncableBubble } from './bubble/index.js';
export { AparteChatInput } from './input/index.js';
export { AparteChatStatus } from './status/index.js';
export { AparteChatViewport } from './viewport/index.js';

// Composer primitives
export { AparteComposer, AparteComposerInput, AparteComposerSend, AparteComposerCancel, AparteComposerAttachments, AparteComposerAddAttachment, AparteComposerAction } from './composer/index.js';
export type { AparteComposerEventMap, AparteComposerEventType, AparteComposerState, AparteComposerChangeEventDetail } from './composer/index.js';

// Conversation list primitive
export { AparteConversationList } from './conversation-list/index.js';
export type { AparteConversationListItem, AparteConversationSelectDetail, AparteConversationDeleteDetail } from './conversation-list/index.js';
