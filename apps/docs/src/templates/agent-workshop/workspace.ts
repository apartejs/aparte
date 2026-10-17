/**
 * The workspace panel beside the chat: three kit tabs over the repository the agent works in.
 *
 * - Files: the file tree, and the file the agent last read or wrote (or the one you picked).
 * - Terminal: every command the agent ran, with its output.
 * - Changes: the diff of every file the agent edited.
 *
 * The panel draws; it decides nothing. The tool handlers (tools.ts) call it as they run, so it
 * follows what the agent did without listening to the chat at all. Code is highlighted through
 * the library's own highlighter (`aparteGlobalConfig.highlightCode`), the one the chat's code
 * blocks use, so a file in the panel and a snippet in a reply look the same.
 */
import { aparteGlobalConfig } from '@aparte/core';
import { languageOf, type Files } from './repo';

export type WorkspaceTab = 'files' | 'terminal' | 'changes';

/** Why a file is on screen: the agent read it, the agent wrote it, or you opened it. */
export type FileNote = 'read' | 'edited' | 'opened';

const NOTES: Record<FileNote, { label: string; badge: string } | null> = {
    read: { label: 'Read by the agent', badge: 'aparte-badge--info' },
    edited: { label: 'Edited by the agent', badge: 'aparte-badge--warning' },
    opened: null,
};

const TABS: WorkspaceTab[] = ['files', 'terminal', 'changes'];

export interface Workspace {
    readonly files: Files;
    /** Show a file in the Files tab, and select the tab. */
    open(path: string, note: FileNote): void;
    /** Replace a file's content, record its diff in Changes, and show it. */
    write(path: string, content: string): void;
    /** Add a command and its output to the Terminal, and select the tab. */
    log(command: string, output: string): void;
    select(tab: WorkspaceTab): void;
}

export function createWorkspace(root: HTMLElement, files: Files): Workspace {
    const original = new Map(files);
    const tabs = new Map(TABS.map((name) => [name, root.querySelector<HTMLButtonElement>(`[data-tab="${name}"]`)!]));
    const tree = root.querySelector<HTMLElement>('[data-workspace="tree"]')!;
    const path = root.querySelector<HTMLElement>('[data-workspace="path"]')!;
    const note = root.querySelector<HTMLElement>('[data-workspace="note"]')!;
    const code = root.querySelector<HTMLElement>('[data-workspace="code"]')!;
    const terminal = root.querySelector<HTMLElement>('[data-workspace="terminal"]')!;
    const changes = root.querySelector<HTMLElement>('[data-workspace="changes"]')!;
    const changeCount = root.querySelector<HTMLElement>('[data-workspace="change-count"]')!;

    let current = '';
    // A highlight is async: a file opened while the previous one was still being coloured wins.
    let generation = 0;

    function select(tab: WorkspaceTab, focus = false): void {
        for (const [name, button] of tabs) {
            const selected = name === tab;
            button.setAttribute('aria-selected', String(selected));
            button.tabIndex = selected ? 0 : -1;
            root.querySelector<HTMLElement>(`#${button.getAttribute('aria-controls')}`)!.hidden = !selected;
        }
        if (focus) tabs.get(tab)!.focus();
    }

    // The tree is drawn once (the agent edits files, it does not add any); `markTree` keeps
    // which file is shown and which are modified, without replacing a button that has the focus.
    function drawTree(): void {
        const folders = new Map<string, string[]>();
        for (const file of files.keys()) {
            const slash = file.lastIndexOf('/');
            const folder = slash === -1 ? '' : file.slice(0, slash);
            folders.set(folder, [...(folders.get(folder) ?? []), file]);
        }
        tree.replaceChildren(
            ...[...folders].map(([folder, paths]) => {
                const group = document.createElement('div');
                group.className = 'agent-workshop__folder';
                const list = document.createElement('ul');
                if (folder) {
                    const label = document.createElement('span');
                    label.className = 'agent-workshop__folder-name';
                    label.id = `aw-folder-${folder}`;
                    label.textContent = `${folder}/`;
                    group.append(label);
                    list.setAttribute('aria-labelledby', label.id);
                }
                for (const file of paths) list.append(treeItem(file));
                group.append(list);
                return group;
            }),
        );
    }

    function treeItem(file: string): HTMLLIElement {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'aparte-btn aparte-btn--ghost aparte-btn--sm agent-workshop__file';
        button.dataset['path'] = file;
        const name = document.createElement('span');
        name.className = 'agent-workshop__file-name';
        name.textContent = file.slice(file.lastIndexOf('/') + 1);
        const badge = document.createElement('span');
        badge.className = 'aparte-badge aparte-badge--warning aparte-badge--sm';
        badge.setAttribute('aria-hidden', 'true');
        badge.textContent = 'M';
        const spoken = document.createElement('span');
        spoken.className = 'aparte-sr-only';
        spoken.textContent = ', modified';
        badge.hidden = spoken.hidden = true;
        button.append(name, badge, spoken);
        item.append(button);
        return item;
    }

    function markTree(): void {
        for (const button of tree.querySelectorAll<HTMLButtonElement>('[data-path]')) {
            const file = button.dataset['path']!;
            if (file === current) button.setAttribute('aria-current', 'true');
            else button.removeAttribute('aria-current');
            const modified = files.get(file) !== original.get(file);
            for (const mark of button.querySelectorAll<HTMLElement>('.aparte-badge, .aparte-sr-only')) mark.hidden = !modified;
        }
    }

    async function show(file: string, why: FileNote): Promise<void> {
        current = file;
        markTree();
        path.textContent = file;
        const tag = NOTES[why];
        note.hidden = !tag;
        if (tag) {
            note.className = `aparte-badge aparte-badge--sm ${tag.badge}`;
            note.textContent = tag.label;
        }
        const mine = ++generation;
        const html = await aparteGlobalConfig.highlightCode(files.get(file) ?? '', languageOf(file));
        if (mine === generation) code.innerHTML = html;
    }

    async function drawChanges(): Promise<void> {
        const edited = [...files.keys()].filter((file) => files.get(file) !== original.get(file));
        changeCount.hidden = edited.length === 0;
        changeCount.textContent = String(edited.length);
        if (edited.length === 0) return;
        const blocks = await Promise.all(
            edited.map(async (file) => {
                const diff = unifiedDiff(file, original.get(file) ?? '', files.get(file) ?? '');
                const block = document.createElement('article');
                block.className = 'aparte-card agent-workshop__diff';
                const head = document.createElement('header');
                head.className = 'aparte-card__header agent-workshop__diff-head';
                // Not a heading: the panel sits outside the page's outline, and a bare h3 fails heading-order.
                const name = document.createElement('span');
                name.className = 'agent-workshop__diff-file';
                name.textContent = file;
                const stat = document.createElement('span');
                stat.className = 'agent-workshop__diff-stat';
                const added = document.createElement('span');
                added.className = 'agent-workshop__ok';
                added.textContent = `+${diff.added}`;
                const removed = document.createElement('span');
                removed.className = 'agent-workshop__fail';
                removed.textContent = `−${diff.removed}`;
                const spoken = document.createElement('span');
                spoken.className = 'aparte-sr-only';
                spoken.textContent = `${diff.added} added, ${diff.removed} removed`;
                added.setAttribute('aria-hidden', 'true');
                removed.setAttribute('aria-hidden', 'true');
                stat.append(added, ' ', removed, spoken);
                head.append(name, stat);
                const body = document.createElement('div');
                body.className = 'agent-workshop__diff-body';
                // Scrolls sideways, so it takes the focus like the code view does.
                body.setAttribute('role', 'region');
                body.tabIndex = 0;
                body.setAttribute('aria-label', `Diff of ${file}`);
                body.innerHTML = await aparteGlobalConfig.highlightCode(diff.text, 'diff');
                // Shiki colours the +/- sign in some themes and the whole line in others; tagging the
                // line lets the stylesheet paint additions and removals the same way in both.
                for (const line of body.querySelectorAll<HTMLElement>('.line')) {
                    const text = line.textContent ?? '';
                    // The ---/+++ file header is not a change.
                    const kind = /^(---|\+\+\+|@)/.test(text) ? 'hunk' : ({ '+': 'add', '-': 'del' } as Record<string, string>)[text[0] ?? ''];
                    if (kind) line.dataset['diff'] = kind;
                }
                block.append(head, body);
                return block;
            }),
        );
        changes.replaceChildren(...blocks);
    }

    drawTree();

    // A pane that was hidden (the phone's Chat view) has no height to scroll: when the terminal
    // gets one, show the newest run.
    new ResizeObserver(() => {
        terminal.scrollTop = terminal.scrollHeight;
    }).observe(terminal);

    // Arrow keys, Home and End move between the tabs: the tab pattern's keyboard half.
    const list = root.querySelector<HTMLElement>('[role="tablist"]')!;
    list.addEventListener('click', (event) => {
        const tab = (event.target as Element).closest<HTMLElement>('[data-tab]')?.dataset['tab'] as WorkspaceTab | undefined;
        if (tab) select(tab);
    });
    list.addEventListener('keydown', (event) => {
        const at = TABS.findIndex((name) => tabs.get(name)!.getAttribute('aria-selected') === 'true');
        const next = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: TABS.length - 1 }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        select(TABS[(next + TABS.length) % TABS.length]!, true);
    });
    tree.addEventListener('click', (event) => {
        const file = (event.target as Element).closest<HTMLElement>('[data-path]')?.dataset['path'];
        if (file) void show(file, 'opened');
    });

    return {
        files,
        open(file, why) {
            void show(file, why);
            select('files');
        },
        write(file, content) {
            files.set(file, content);
            void show(file, 'edited');
            void drawChanges();
            select('changes');
        },
        log(command, output) {
            terminal.querySelector('[data-workspace="terminal-empty"]')?.remove();
            const run = document.createElement('div');
            run.className = 'agent-workshop__run';
            const prompt = document.createElement('div');
            prompt.className = 'agent-workshop__prompt';
            prompt.textContent = `$ ${command}`;
            const out = document.createElement('pre');
            out.className = 'agent-workshop__output';
            for (const line of output.split('\n')) {
                const row = document.createElement('span');
                row.textContent = `${line}\n`;
                const tone = toneOf(line);
                if (tone) row.className = `agent-workshop__${tone}`;
                out.append(row);
            }
            run.append(prompt, out);
            terminal.append(run);
            // Selected first: a hidden panel has no height to scroll.
            select('terminal');
            terminal.scrollTop = terminal.scrollHeight;
        },
        select: (tab) => select(tab),
    };
}

/** How a line of test output reads at a glance: a failure, a pass, or the runner's own chatter. */
function toneOf(line: string): 'fail' | 'ok' | 'dim' | undefined {
    if (/^\s*(×|→|FAIL|AssertionError)/.test(line) || line.includes(' failed')) return 'fail';
    if (/^\s*✓/.test(line) || /passed \(\d+\)$/.test(line)) return 'ok';
    if (/^\s*(>|❯|\d+\||\|)/.test(line)) return 'dim';
    return undefined;
}

interface Diff {
    text: string;
    added: number;
    removed: number;
}

/**
 * A unified diff with three lines of context around the one changed region. The agent's edits
 * here are a single replacement, so one hunk is the whole story.
 */
export function unifiedDiff(file: string, before: string, after: string): Diff {
    const a = before.split('\n');
    const b = after.split('\n');
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start++;
    let endA = a.length;
    let endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
        endA--;
        endB--;
    }
    const from = Math.max(0, start - 3);
    const toA = Math.min(a.length, endA + 3);
    const toB = Math.min(b.length, endB + 3);
    const lines = [
        `--- a/${file}`,
        `+++ b/${file}`,
        `@@ -${from + 1},${toA - from} +${from + 1},${toB - from} @@`,
        ...a.slice(from, start).map((line) => ` ${line}`),
        ...a.slice(start, endA).map((line) => `-${line}`),
        ...b.slice(start, endB).map((line) => `+${line}`),
        ...a.slice(endA, toA).map((line) => ` ${line}`),
    ];
    return { text: lines.join('\n'), added: endB - start, removed: endA - start };
}
