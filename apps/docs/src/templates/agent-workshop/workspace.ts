/**
 * The workspace panel beside the chat: three kit tabs over the repository the agent works in.
 *
 * - Files: the file tree, and the file the agent last read or wrote (or the one you picked).
 * - Terminal: every command the agent ran, with its output.
 * - Changes: the diff of every file the agent edited (`<aparte-diff commentable>`). A comment on
 *   a line is kept here, pending, until Send review sends them all to the agent as one message.
 * - A sub-agent, once its line is opened: its conversation, live (`<aparte-subagent-view>`, wired
 *   in app.ts). While it is the tab on screen, the tools no longer switch tabs as they run: the
 *   reader chose to watch that sub-agent, and its own reads and runs would take them away.
 *
 * The panel draws; it decides nothing. The tool handlers (tools.ts) call it as they run, so it
 * follows what the agent did without listening to the chat at all. Code is highlighted through
 * the library's own highlighter (`aparteGlobalConfig.highlightCode`), the one the chat's code
 * blocks use, so a file in the panel and a snippet in a reply look the same.
 */
import { aparteGlobalConfig, enhanceTabs } from '@aparte/core';
import type { AparteDiff, AparteDiffComment } from '@aparte/plugin-diff';
import '@aparte/plugin-diff';
import { languageOf, type Files } from './repo';

/** How a review message starts: the scripted agent knows one by it (scenario.ts). */
export const REVIEW_HEADING = 'Review of your changes';

export type WorkspaceTab = 'files' | 'terminal' | 'changes' | 'agent';

/** Why a file is on screen: the agent read it, the agent wrote it, or you opened it. */
export type FileNote = 'read' | 'edited' | 'opened';

const NOTES: Record<FileNote, { label: string; badge: string } | null> = {
    read: { label: 'Read by the agent', badge: 'aparte-badge--info' },
    edited: { label: 'Edited by the agent', badge: 'aparte-badge--warning' },
    opened: null,
};

const TABS: WorkspaceTab[] = ['files', 'terminal', 'changes', 'agent'];

export interface Workspace {
    readonly files: Files;
    /** Show a file in the Files tab, and select the tab. */
    open(path: string, note: FileNote): void;
    /** Replace a file's content, record its diff in Changes, and show it. */
    write(path: string, content: string): void;
    /** Add a command and its output to the Terminal, and select the tab. */
    log(command: string, output: string): void;
    select(tab: WorkspaceTab): void;
    /** Show the sub-agent tab, named after it, and select it. */
    showAgent(name: string): void;
    /** Take the sub-agent tab away, and go back to Files. */
    hideAgent(): void;
}

export interface WorkspaceOptions {
    /** Send a review to the agent as the person's message; `false` when it cannot go now (a reply is streaming). */
    sendReview(text: string): boolean;
}

export function createWorkspace(root: HTMLElement, files: Files, options: WorkspaceOptions): Workspace {
    const original = new Map(files);
    const tabs = new Map(TABS.map((name) => [name, root.querySelector<HTMLButtonElement>(`[data-tab="${name}"]`)!]));
    const tree = root.querySelector<HTMLElement>('[data-workspace="tree"]')!;
    const path = root.querySelector<HTMLElement>('[data-workspace="path"]')!;
    const note = root.querySelector<HTMLElement>('[data-workspace="note"]')!;
    const code = root.querySelector<HTMLElement>('[data-workspace="code"]')!;
    const terminal = root.querySelector<HTMLElement>('[data-workspace="terminal"]')!;
    const changeCount = root.querySelector<HTMLElement>('[data-workspace="change-count"]')!;
    const noChanges = root.querySelector<HTMLElement>('[data-workspace="changes-empty"]')!;
    const diff = root.querySelector<AparteDiff>('[data-workspace="diff"]')!;
    const review = root.querySelector<HTMLElement>('[data-workspace="review"]')!;
    const reviewNote = root.querySelector<HTMLElement>('[data-workspace="review-note"]')!;
    const sendReview = root.querySelector<HTMLButtonElement>('[data-workspace="send-review"]')!;

    /** The reader's comments on the diff, with the lines each is about: pending until the review is sent. */
    const comments: ReviewComment[] = [];

    let current = '';
    // A highlight is async: a file opened while the previous one was still being coloured wins.
    let generation = 0;

    /** A tab chosen by the agent's tools rather than the reader: the same path as a click. */
    function select(tab: WorkspaceTab): void {
        tabs.get(tab)!.click();
    }

    /** A tool's turn to show what it did, unless the reader is watching a sub-agent. */
    function follow(tab: WorkspaceTab): void {
        if (tabs.get('agent')!.getAttribute('aria-selected') === 'true') return;
        select(tab);
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

    /** Every edited file, before and after: the diff element computes the hunks and can show every line. */
    function drawChanges(): void {
        const edited = [...files.keys()].filter((file) => files.get(file) !== original.get(file));
        changeCount.hidden = edited.length === 0;
        changeCount.textContent = String(edited.length);
        noChanges.hidden = edited.length > 0;
        diff.hidden = review.hidden = edited.length === 0;
        diff.diff = edited.map((file) => ({ path: file, before: original.get(file) ?? '', after: files.get(file) ?? '' }));
        drawReview();
    }

    /** The bar over the diff: how many comments wait, and the button that sends them. */
    function drawReview(): void {
        const pending = comments.filter((comment) => comment.state === 'pending').length;
        sendReview.disabled = pending === 0;
        reviewNote.textContent = pending === 0
            ? 'Click a line number to comment on it.'
            : `${pending} comment${pending === 1 ? '' : 's'} to send.`;
    }

    diff.addEventListener('aparte-diff-comment', (event) => {
        comments.push({ ...event.detail, id: `c${comments.length + 1}`, state: 'pending' });
        diff.comments = comments;
        drawReview();
    });

    sendReview.addEventListener('click', () => {
        const pending = comments.filter((comment) => comment.state === 'pending');
        if (!pending.length || !options.sendReview(reviewMessage(pending))) return;
        for (const comment of pending) comment.state = 'sent';
        diff.comments = comments;
        drawReview();
    });

    drawTree();

    // A pane that was hidden (the phone's Chat view) has no height to scroll: when the terminal
    // gets one, show the newest run.
    new ResizeObserver(() => {
        terminal.scrollTop = terminal.scrollHeight;
    }).observe(terminal);

    // The tab pattern's keyboard half is the kit's: one tab stop, the arrows (the other way in
    // a right-to-left page), Home and End, the panel shown and the others hidden. The
    // sub-agent's tab is skipped while it is hidden. The panel lives as long as the page.
    enhanceTabs(root.querySelector<HTMLElement>('[role="tablist"]')!);
    tree.addEventListener('click', (event) => {
        const file = (event.target as Element).closest<HTMLElement>('[data-path]')?.dataset['path'];
        if (file) void show(file, 'opened');
    });

    return {
        files,
        open(file, why) {
            void show(file, why);
            follow('files');
        },
        write(file, content) {
            files.set(file, content);
            void show(file, 'edited');
            drawChanges();
            follow('changes');
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
            follow('terminal');
            terminal.scrollTop = terminal.scrollHeight;
        },
        select: (tab) => select(tab),
        showAgent(name) {
            const tab = tabs.get('agent')!;
            root.querySelector<HTMLElement>('[data-workspace="agent-name"]')!.textContent = name;
            tab.hidden = false;
            select('agent');
        },
        hideAgent() {
            tabs.get('agent')!.hidden = true;
            select('files');
        },
    };
}

/** How a line of test output reads at a glance: a failure, a pass, or the runner's own chatter. */
function toneOf(line: string): 'fail' | 'ok' | 'dim' | undefined {
    if (/^\s*(×|→|FAIL|AssertionError)/.test(line) || line.includes(' failed')) return 'fail';
    if (/^\s*✓/.test(line) || /passed \(\d+\)$/.test(line)) return 'ok';
    if (/^\s*(>|❯|\d+\||\|)/.test(line)) return 'dim';
    return undefined;
}

/** A comment on the diff, with the lines it is about (the event's `code`), as the review quotes it. */
export type ReviewComment = AparteDiffComment & { code: string };

/**
 * The comments as ONE message to the agent, one line each: where it is, the first line it is
 * about, and what the reader said. The agent reads the whole review at once, as a reviewer
 * sends one.
 */
export function reviewMessage(comments: readonly ReviewComment[]): string {
    const lines = comments.map((comment) => {
        const where = comment.startLine === comment.endLine ? `line ${comment.startLine}` : `lines ${comment.startLine}–${comment.endLine}`;
        const first = comment.code.split('\n')[0]!.trim();
        const more = comment.code.includes('\n') ? ' …' : '';
        const quote = first ? `, \`${first.replace(/`/g, "'")}\`${more}` : '';
        return `- ${comment.path}, ${comment.side === 'old' ? 'removed ' : ''}${where}${quote} — ${comment.text.replace(/\s+/g, ' ')}`;
    });
    return `${REVIEW_HEADING}, ${comments.length} comment${comments.length === 1 ? '' : 's'}:\n\n${lines.join('\n')}`;
}
