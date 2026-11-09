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
        // A list stays a list, so that a search can look inside it.
        ...(children ? { children: typeof children === 'function' ? () => commandItems(children(scope), '', scope) : commandItems(children, '', scope) } : {}),
    };
}

/** A plugin's gate that throws closes its own command, not the whole menu. */
function appliesHere(command: AparteCommand, scope: AparteCommandScope): boolean {
    try {
        return command.enabled?.(scope) ?? true;
    } catch (error) {
        console.warn(`[aparte-triggers] "${command.id}" could not say whether it applies here.`, error);
        return false;
    }
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
        .filter((command) => !command.hidden && appliesHere(command, scope))
        .map((command, index) => ({ command, index }))
        .sort((a, b) => (a.command.order ?? 100) - (b.command.order ?? 100) || a.index - b.index)
        .map(({ command }) => toItem(command, char, scope));
}
