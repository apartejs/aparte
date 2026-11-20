/**
 * The type a dragged conversation row carries in its `dataTransfer`, the conversation's id as its
 * data. An element of your own can take a row as a drop: read it with
 * `event.dataTransfer.getData(APARTE_CONVERSATION_DRAG_TYPE)`, and allow the drop (call
 * `preventDefault()` on `dragover`) when `event.dataTransfer.types` includes it.
 *
 * DOM-free, so the Node entry exports it too.
 */
export const APARTE_CONVERSATION_DRAG_TYPE = 'application/x-aparte-conversation';
