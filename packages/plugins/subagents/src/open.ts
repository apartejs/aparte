/**
 * A sub-agent's line opens its conversation elsewhere: what the line says (the Open button,
 * which one is shown now) and what pressing it dispatches.
 *
 * The line provider gives core an `open` for every sub-agent's line when the setup asks for
 * it; core draws the button and calls back with the row. The plugin then dispatches
 * `aparte-subagent-open` from the row, and the app (or `connectSubagentView`) decides where the
 * conversation goes. Which sub-agent is shown is kept here, by whoever shows it, so a line
 * drawn again — a reload, a row rebuilt — still says it is the one open.
 */
import type { AparteToolCallSegment } from '@aparte/core';
import type { AparteSubagent, AparteSubagentOpenEventDetail } from './types.js';

/** The sub-agent each view shows now, by the view's wiring. */
const shown = new Map<object, string>();

const keyOf = (messageId: string, agentId: string): string => `${messageId}\u0000${agentId}`;

/** Whether some view shows this sub-agent now. */
export function isShown(messageId: string | undefined, agentId: string): boolean {
    if (!messageId || shown.size === 0) return false;
    const key = keyOf(messageId, agentId);
    for (const value of shown.values()) if (value === key) return true;
    return false;
}

/** `owner` shows this sub-agent now, or nothing (`null`). */
export function setShown(owner: object, at: { messageId: string; agentId: string } | null): void {
    if (at) shown.set(owner, keyOf(at.messageId, at.agentId));
    else shown.delete(owner);
}

/**
 * The row's Open button: core's, in its own line, or — a row with a detail — in the slot
 * beside its disclosure (never in a summary, never a nested row's).
 */
export const openButtonOf = (row: Element): HTMLElement | null =>
    row.querySelector<HTMLElement>(':scope > :is(.aparte-tool-line, .aparte-tool-open-slot) > .aparte-tool-open');

/**
 * Mark a row as the one shown, or not: the two marks core writes from `open.current` when it
 * draws the row, written here on a row already drawn so it does not wait for its next draw.
 */
export function markRow(row: Element, on: boolean): void {
    const button = openButtonOf(row);
    if (!button) return;
    row.toggleAttribute('data-current', on);
    if (on) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
}

/** Every row marked as shown under `root`, unmarked. */
export function unmarkAll(root: ParentNode): void {
    for (const row of root.querySelectorAll('.aparte-segment-tool-call[data-current]')) markRow(row, false);
}

/**
 * The chat the row is in: the `<aparte-chat>` around it, else the chat a standalone
 * `<aparte-subagent-view>` reads (its own sub-agents' lines).
 */
function targetIdOf(row: Element): string | undefined {
    const chat = row.closest('aparte-chat');
    if (chat) return chat.id || undefined;
    const view = row.closest('aparte-subagent-view:not([data-inline])') as (Element & { chat?: { id?: unknown } | null }) | null;
    if (!view) return undefined;
    const id = view.getAttribute('for') || (typeof view.chat?.id === 'string' ? view.chat.id : '');
    return id || undefined;
}

/** Dispatch `aparte-subagent-open` from the row of `sub`, drawn for `segment`. */
export function dispatchOpen(row: HTMLElement, segment: AparteToolCallSegment, sub: AparteSubagent, standIn: boolean): void {
    const messageId = segment.messageId || row.closest('[message-id]')?.getAttribute('message-id') || '';
    if (!messageId) return;
    const targetId = targetIdOf(row);
    const name = sub.name?.trim();
    const toolCallId = standIn ? undefined : segment.toolCall?.id;
    const detail: AparteSubagentOpenEventDetail = {
        ...(targetId ? { targetId } : {}),
        messageId,
        agentId: sub.id,
        ...(name ? { name } : {}),
        ...(toolCallId ? { toolCallId } : {}),
    };
    row.dispatchEvent(new CustomEvent('aparte-subagent-open', { bubbles: true, composed: true, detail }));
}
