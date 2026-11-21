/**
 * `?harness=conversation-move`: a conversation list of its own, with the app's groups and
 * `moveTargets`, and an app that writes each move it is told about, the way an app does: it
 * changes its own data and assigns `conversations` again. `e2e/tests/conversation-move.spec.ts`
 * drives it with the mouse and the keyboard.
 *
 * Its own list, beside the page's: the site's list is the conversation manager's, which keeps
 * no group. Two projects with rows, a project with none (reached by the menu only: a group no
 * row is in has no heading to drop on), and two rows in no project.
 */
import type { AparteConversationGroup, AparteConversationListItem, AparteConversationMoveDetail } from '@aparte/core';

const LAUNCH: AparteConversationGroup = { key: 'p-launch', label: 'Launch' };
const DOCS: AparteConversationGroup = { key: 'p-docs', label: 'Docs' };
const OPS: AparteConversationGroup = { key: 'p-ops', label: 'Ops' };

type MoveList = HTMLElement & { conversations: AparteConversationListItem[]; moveTargets: AparteConversationGroup[] };

/** Mount the harness list when the URL asks for it. */
export function mountConversationMoveHarness(): void {
    if (new URLSearchParams(location.search).get('harness') !== 'conversation-move') return;
    const groups = new Map([LAUNCH, DOCS, OPS].map((g) => [g.key, g]));
    let items: AparteConversationListItem[] = [
        { id: 'plan', title: 'Launch plan', group: LAUNCH },
        { id: 'pricing', title: 'Pricing page', group: LAUNCH },
        { id: 'api', title: 'API reference', group: DOCS },
        { id: 'quick', title: 'A quick question', updatedAt: Date.now() },
        { id: 'recipe', title: 'Bread recipe', updatedAt: Date.now() },
    ];

    const panel = document.createElement('aside');
    panel.className = 'site-move-harness';
    panel.setAttribute('aria-label', 'Projects');
    panel.style.cssText = 'position:fixed;inset-block-start:16px;inset-inline-end:16px;inline-size:280px;max-block-size:80vh;overflow:auto;padding:8px;z-index:50;background:var(--aparte-surface-1);border:1px solid var(--aparte-border);border-radius:12px';
    const list = document.createElement('aparte-conversation-list') as MoveList;
    list.id = 'move-list';
    panel.append(list);
    document.body.append(panel);

    list.moveTargets = [LAUNCH, DOCS, OPS];
    list.conversations = items;
    list.addEventListener('aparte-conversation-move', (e) => {
        const { id, to } = (e as CustomEvent<AparteConversationMoveDetail>).detail;
        items = items.map((c) => {
            if (c.id !== id) return c;
            const { group: _left, ...rest } = c;
            const target = to ? groups.get(to) : undefined;
            return target ? { ...rest, group: target } : { ...rest, updatedAt: Date.now() };
        });
        list.conversations = items;
    });
}

/**
 * `?harness=conversation-lists`: one `flat` list per project, each under a heading the app draws,
 * each with the key of its project in `drop-key`. A row dragged from one list onto the other is
 * moved there by the app, which assigns both lists again.
 */
export function mountConversationListsHarness(): void {
    if (new URLSearchParams(location.search).get('harness') !== 'conversation-lists') return;
    const projects = [{ ...LAUNCH, id: 'list-launch' }, { ...DOCS, id: 'list-docs' }];
    const rows: Record<string, AparteConversationListItem[]> = {
        'p-launch': [{ id: 'plan', title: 'Launch plan' }, { id: 'pricing', title: 'Pricing page' }],
        'p-docs': [{ id: 'api', title: 'API reference' }],
    };
    const panel = document.createElement('aside');
    panel.className = 'site-move-harness';
    panel.setAttribute('aria-label', 'Projects');
    panel.style.cssText = 'position:fixed;inset-block-start:16px;inset-inline-end:16px;inline-size:280px;max-block-size:80vh;overflow:auto;padding:8px;z-index:50;background:var(--aparte-surface-1);border:1px solid var(--aparte-border);border-radius:12px';
    const lists = new Map<string, MoveList>();
    for (const project of projects) {
        const heading = document.createElement('h3');
        heading.textContent = project.label;
        heading.style.cssText = 'margin:8px 4px 4px;font-size:13px';
        const list = document.createElement('aparte-conversation-list') as MoveList & { dropKey: string | null };
        list.id = project.id;
        list.setAttribute('flat', '');
        list.dropKey = project.key;
        list.moveTargets = projects.filter((p) => p.key !== project.key).map(({ key, label }) => ({ key, label }));
        list.conversations = rows[project.key]!;
        lists.set(project.key, list);
        panel.append(heading, list);
    }
    document.body.append(panel);
    panel.addEventListener('aparte-conversation-move', (e) => {
        const { id, from, to } = (e as CustomEvent<AparteConversationMoveDetail>).detail;
        if (!from || !to) return;
        const moved = rows[from]!.find((c) => c.id === id);
        if (!moved) return;
        rows[from] = rows[from]!.filter((c) => c.id !== id);
        rows[to] = [...rows[to]!, moved];
        lists.get(from)!.conversations = rows[from]!;
        lists.get(to)!.conversations = rows[to]!;
    });
}
