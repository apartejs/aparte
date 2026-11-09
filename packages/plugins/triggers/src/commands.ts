/**
 * `@aparte/plugin-triggers/commands`: `/new`, `/stop`, `/retry` and `/copy`. Apart from the
 * main entry, and asked for explicitly: a chat that wants none of them pays for none.
 */
import { aparteGlobalConfig, copyText, type AparteChatViewport, type AparteConfig, type AparteMessage } from '@aparte/core';
import type { AparteCommand, AparteCommandScope } from './types.js';

export interface AparteCommandsOptions {
    /** Ids to leave out, among `new`, `stop`, `retry`, `copy`. */
    exclude?: readonly string[];
    /**
     * What `/new` does: start a conversation, usually `controller.setConversationId(null)`.
     * Without it `/new` empties this chat, which a chat drawn by a framework cannot do from
     * here: it owns its messages, so `/new` is not listed there until you say how.
     */
    onNew?: () => void;
}

/** A composer names its viewport with `target`, or sits with it in a chat. */
function viewportOf(scope: AparteCommandScope): AparteChatViewport | null {
    const named = scope.targetId ? document.getElementById(scope.targetId) : null;
    if (named?.matches('aparte-chat-viewport')) return named as AparteChatViewport;
    return (named ?? scope.chat ?? scope.composer.parentElement)?.querySelector<AparteChatViewport>('aparte-chat-viewport') ?? null;
}

const lastAnswer = (scope: AparteCommandScope): AparteMessage | undefined => {
    const messages = viewportOf(scope)?.getMessages() ?? [];
    return [...messages].reverse().find((message) => message.role === 'assistant');
};

const replyText = (message: AparteMessage): string => {
    if (!message.segments?.length) return message.content ?? '';
    return message.segments
        .filter((segment) => segment.type === 'text')
        .map((segment) => (segment as { content: string }).content)
        .join('\n\n');
};

function builtIns(options: AparteCommandsOptions): AparteCommand[] {
    return [
        {
            id: 'new',
            order: 10,
            description: 'triggersCommandNew',
            icon: 'edit',
            enabled: (scope) => !!options.onNew || !!viewportOf(scope) && !viewportOf(scope)!.hasAttribute('framework-managed'),
            run: (context) => {
                if (options.onNew) options.onNew();
                else viewportOf(context)?.clearAll();
            },
        },
        {
            id: 'stop',
            order: 20,
            description: 'triggersCommandStop',
            icon: 'stop',
            enabled: (scope) => scope.composer.streaming,
            run: (context) => { context.composer.cancel(); },
        },
        {
            id: 'retry',
            order: 30,
            description: 'triggersCommandRetry',
            icon: 'retry',
            enabled: (scope) => !scope.composer.streaming && !!lastAnswer(scope),
            run: (context) => {
                const answer = lastAnswer(context);
                if (!answer) return;
                window.dispatchEvent(new CustomEvent('aparte-retry', { detail: { messageId: answer.id, targetId: context.targetId } }));
            },
        },
        {
            id: 'copy',
            order: 40,
            description: 'triggersCommandCopy',
            icon: 'copy',
            enabled: (scope) => { const answer = lastAnswer(scope); return !!answer && !!replyText(answer); },
            run: async (context) => {
                const answer = lastAnswer(context);
                if (!answer) return;
                await copyText(replyText(answer));
                context.notify(context.config.t('copied'));
            },
        },
    ];
}

/** Answer the menus on this config with the built-in commands. Returns what removes them. */
export function setupCommands(options: AparteCommandsOptions = {}, config: AparteConfig = aparteGlobalConfig): () => void {
    const exclude = new Set(options.exclude ?? []);
    const listener = ({ detail }: WindowEventMap['aparte-collect-commands']): void => {
        if (detail.config !== config) return;
        for (const command of builtIns(options)) {
            if (exclude.has(command.id)) continue;
            detail.add({ ...command, description: config.t(command.description as never) });
        }
    };
    window.addEventListener('aparte-collect-commands', listener);
    return () => window.removeEventListener('aparte-collect-commands', listener);
}
