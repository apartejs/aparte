import type {
    AparteCollectCommandsEventDetail, AparteCommand, AparteCommandScope, AparteTriggerCommands, AparteTriggerItem,
} from './types.js';

/** Ask whoever is listening for their commands. The last to answer for an id wins. */
export function collectCommands(host: HTMLElement, scope: AparteCommandScope): AparteCommand[] {
    const found = new Map<string, AparteCommand>();
    host.dispatchEvent(new CustomEvent<AparteCollectCommandsEventDetail>('aparte-collect-commands', {
        bubbles: true,
        composed: true,
        detail: {
            config: scope.config,
            chat: scope.chat,
            composer: scope.composer,
            add(command) {
                found.delete(command.id);
                found.set(command.id, command);
            },
        },
    }));
    return [...found.values()];
}

function toItem(command: AparteCommand, char: string, scope: AparteCommandScope): AparteTriggerItem {
    const name = command.name ?? command.id;
    const { children } = command;
    return {
        id: command.id,
        label: command.label ?? `${char}${name}`,
        keywords: [name, ...(command.keywords ?? [])],
        ...(command.description !== undefined ? { description: command.description } : {}),
        ...(command.icon !== undefined ? { icon: command.icon } : {}),
        ...(command.group !== undefined ? { group: command.group } : {}),
        ...(command.run ? { run: command.run } : {}),
        ...(children ? { children: () => commandItems(typeof children === 'function' ? children(scope) : children, '', scope) } : {}),
    };
}

/** The commands as rows: the app's choices applied last, what cannot act here left out. */
export function commandItems(
    commands: readonly AparteCommand[],
    char: string,
    scope: AparteCommandScope,
    choices: AparteTriggerCommands = {},
): AparteTriggerItem[] {
    const exclude = new Set(choices.exclude ?? []);
    return commands
        .filter((command) => !exclude.has(command.id))
        .map((command) => ({ ...command, ...choices.override?.[command.id] }))
        .filter((command) => !command.hidden && (command.enabled?.(scope) ?? true))
        .map((command, index) => ({ command, index }))
        .sort((a, b) => (a.command.order ?? 100) - (b.command.order ?? 100) || a.index - b.index)
        .map(({ command }) => toItem(command, char, scope));
}
