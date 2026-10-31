/**
 * @aparte/plugin-cards/plan — an agent's plan, its task list, or its progress through steps.
 *
 *   import { setupPlanCard } from '@aparte/plugin-cards/plan';
 *
 *   setupPlanCard({ tool: 'update_plan' });
 *
 *   // A tool whose INPUT is the list and whose result is only "ok" — Claude Code's
 *   // `TodoWrite`, say — reads its input instead:
 *   setupPlanCard({ tool: 'TodoWrite', map: (_result, input) => input });
 *
 * Three variants of one card: `checklist` (a header with "3 of 7 done" and a thin bar,
 * then one row per step with its status glyph, its detail and, once it finished, its
 * duration), `timeline` (a rail with a node per step coloured by its status, the start
 * time and duration beside each, the current node pulsing) and `compact` (one line —
 * "Step 3 of 7: Running the tests", a ring and the percentage — for a running plan in a
 * small space).
 *
 * This is the card an agent updates while it works: the same call re-sent with new
 * statuses, which the kit draws into the SAME root. So a step changing STATUS changes no
 * row's height: the title holds the room of its bold form and, for a todo with an active
 * form (Claude Code's `activeForm`), of both wordings; a timed plan keeps every row's
 * duration slot, filled or not, as wide as the language's widest duration; and the
 * timeline keeps every node's time line.
 *
 * What the card cannot hold for an update it has not seen: a detail the update brings (a
 * line under the title appears), a title the tool rewrites, and the first time a plan
 * carries — every row gains its time slot then, unless the plan said `timed: true` from its
 * first draw. LangGraph's `past_steps` results are not drawn at all: every step gains one
 * on completing, so every step would grow; a `map` that wants them gives them as `detail`.
 *
 * Your tool keeps its own fields: `readPlan` reads `{ title, goal, steps }`, a bare list of
 * steps, a list of strings (each a step to do), a Markdown checklist (`- [x] Write the
 * tests`), and the shapes agents already emit — Claude Code's and OpenAI's todo lists
 * (`todos[]` of `content`/`activeForm`/`status`), Codex's `plan[]` of `step`/`status`,
 * LangGraph's plan-and-execute state (`plan: string[]` and `past_steps` of
 * `[step, result]`), and `tasks[]` of `name`/`state`/`done`. `map` covers the rest.
 */
import type { AparteConfig } from '@aparte/core';
import { defineCard, type CardContext, type CardSetupOptions } from '../kit/define.js';
import { el, glyph, num, str } from '../kit/dom.js';
import { formatNumber, formatPercent, toDate } from '../kit/format.js';
import { intlTag, word, type CardWord } from '../kit/strings.js';
import { CLOCK, NODE_CURRENT, PLAN, STATUS_GLYPHS } from './icons.js';
import planStyles from './plan.css?raw';

export type PlanVariant = 'checklist' | 'timeline' | 'compact';

/** Where a step stands. */
export type PlanStatus = 'pending' | 'in-progress' | 'done' | 'failed' | 'skipped' | 'blocked';

type When = string | number | Date;

/**
 * One step as `map` returns it. Only `title` is needed; a step without `status` is
 * `pending` (or, when it has sub-steps, where they stand).
 */
export interface PlanStepInput {
    title: string;
    /** The wording while it runs ("Running the tests"), Claude Code's `activeForm`: shown while the step is in progress. */
    activeForm?: string;
    /** `pending`, `in-progress`, `done`, `failed`, `skipped`, `blocked` — or the usual words for them (`todo`, `running`, `completed`, `error`, `cancelled`…). */
    status?: PlanStatus | string;
    /** One or two lines under the title: what it did, why it failed. */
    detail?: string;
    startedAt?: When;
    finishedAt?: When;
    /** In seconds; worked out from the two dates when it is absent. */
    duration?: number;
    /** One level of sub-steps. */
    substeps?: Array<PlanStepInput | string>;
    id?: string;
}

/** What `map` returns: a plan, a list of steps, or a list of strings. */
export type PlanInput =
    | {
        title?: string;
        goal?: string;
        steps: Array<PlanStepInput | string>;
        updatedAt?: When;
        /**
         * The steps will carry times (a start, a duration) — say it before the first one does,
         * and every row keeps its time slot from the first draw, so the update that brings the
         * first time moves no row. Without it, the slots appear with that update.
         */
        timed?: boolean;
    }
    | Array<PlanStepInput | string>;

/** One step as the card draws it, once read. */
export interface PlanStep {
    /** The wording shown now: the active form while the step runs, when it has one. */
    title: string;
    /**
     * The other wording — the active form while `title` is the plain one, and the reverse.
     * Never shown: the title holds its room too, so the update that switches wording moves no row.
     */
    altTitle?: string;
    status: PlanStatus;
    detail?: string;
    startedAt?: Date;
    finishedAt?: Date;
    /** Seconds, never negative. */
    duration?: number;
    /** Never nested deeper. */
    substeps?: PlanStep[];
    id?: string;
}

/** The data as the card draws it. */
export interface PlanData {
    title?: string;
    goal?: string;
    /** One at least; at most fifty, sub-steps counted. */
    steps: PlanStep[];
    updatedAt?: Date;
    /** The plan said its steps will carry times: their slots are kept from the first draw. */
    timed?: boolean;
}

/** How far a plan has got, over its top-level steps. */
export interface PlanProgress {
    total: number;
    done: number;
    skipped: number;
    failed: number;
    blocked: number;
    /** `done` + `skipped`: what the bar fills with. */
    finished: number;
    /** `finished / total`, 0–1. */
    ratio: number;
    /** The step under way: the first in progress, else the first to do, else the first blocked. */
    current?: PlanStep;
    currentIndex?: number;
    /** With nothing left to do, the first step that failed — where the plan stopped. */
    stoppedIndex?: number;
    /** Seconds from the first start to the last date the plan holds, else the sum of the durations. */
    elapsed?: number;
}

const W = {
    cardsPlanTitle: { en: 'Plan', fr: 'Plan', de: 'Plan', es: 'Plan', it: 'Piano', ja: '計画', ko: '계획', pt: 'Plano', ru: 'План', zh: '计划' },
    cardsPlanProgress: {
        en: '{done} of {total} done', fr: '{done} sur {total} terminées', de: '{done} von {total} erledigt', es: '{done} de {total} completados',
        it: '{done} di {total} completati', ja: '{total}件中{done}件完了', ko: '{total}개 중 {done}개 완료', pt: '{done} de {total} concluídos',
        ru: 'Выполнено {done} из {total}', zh: '已完成 {done}/{total}',
    },
    cardsPlanSkipped: {
        en: '{n} skipped', fr: 'Ignorées : {n}', de: 'Übersprungen: {n}', es: 'Omitidos: {n}', it: 'Saltati: {n}',
        ja: 'スキップ {n}件', ko: '건너뜀 {n}개', pt: 'Ignorados: {n}', ru: 'Пропущено: {n}', zh: '已跳过 {n} 项',
    },
    cardsPlanFailed: {
        en: '{n} failed', fr: 'Échecs : {n}', de: 'Fehlgeschlagen: {n}', es: 'Fallidos: {n}', it: 'Falliti: {n}',
        ja: '失敗 {n}件', ko: '실패 {n}개', pt: 'Falhas: {n}', ru: 'Ошибок: {n}', zh: '失败 {n} 项',
    },
    cardsPlanElapsed: {
        en: '{time} elapsed', fr: 'Durée : {time}', de: 'Dauer: {time}', es: 'Duración: {time}', it: 'Durata: {time}',
        ja: '経過時間 {time}', ko: '경과 {time}', pt: 'Duração: {time}', ru: 'Прошло: {time}', zh: '用时 {time}',
    },
    cardsPlanStepNow: {
        en: 'Step {n} of {total}:', fr: 'Étape {n} sur {total} :', de: 'Schritt {n} von {total}:', es: 'Paso {n} de {total}:',
        it: 'Passo {n} di {total}:', ja: 'ステップ {n}/{total}：', ko: '{total}단계 중 {n}단계:', pt: 'Etapa {n} de {total}:',
        ru: 'Шаг {n} из {total}:', zh: '第 {n}/{total} 步：',
    },
    cardsPlanAllDone: {
        en: 'All steps done', fr: 'Toutes les étapes sont terminées', de: 'Alle Schritte erledigt', es: 'Todos los pasos completados',
        it: 'Tutti i passi completati', ja: 'すべてのステップが完了', ko: '모든 단계 완료', pt: 'Todas as etapas concluídas',
        ru: 'Все шаги выполнены', zh: '所有步骤已完成',
    },
    cardsPlanStatusPending: { en: 'To do', fr: 'À faire', de: 'Offen', es: 'Pendiente', it: 'Da fare', ja: '未着手', ko: '대기', pt: 'A fazer', ru: 'Не начато', zh: '待办' },
    cardsPlanStatusInProgress: { en: 'In progress', fr: 'En cours', de: 'In Arbeit', es: 'En curso', it: 'In corso', ja: '進行中', ko: '진행 중', pt: 'Em andamento', ru: 'Выполняется', zh: '进行中' },
    cardsPlanStatusDone: { en: 'Done', fr: 'Terminé', de: 'Erledigt', es: 'Hecho', it: 'Fatto', ja: '完了', ko: '완료', pt: 'Concluído', ru: 'Готово', zh: '已完成' },
    cardsPlanStatusFailed: { en: 'Failed', fr: 'Échec', de: 'Fehlgeschlagen', es: 'Fallido', it: 'Non riuscito', ja: '失敗', ko: '실패', pt: 'Falhou', ru: 'Ошибка', zh: '失败' },
    cardsPlanStatusSkipped: { en: 'Skipped', fr: 'Ignoré', de: 'Übersprungen', es: 'Omitido', it: 'Saltato', ja: 'スキップ', ko: '건너뜀', pt: 'Ignorado', ru: 'Пропущено', zh: '已跳过' },
    cardsPlanStatusBlocked: { en: 'Blocked', fr: 'Bloqué', de: 'Blockiert', es: 'Bloqueado', it: 'Bloccato', ja: 'ブロック中', ko: '차단됨', pt: 'Bloqueado', ru: 'Заблокировано', zh: '受阻' },
    cardsPlanSummary: {
        en: '{done}/{total} done', fr: '{done}/{total} terminées', de: '{done}/{total} erledigt', es: '{done}/{total} completados',
        it: '{done}/{total} completati', ja: '{done}/{total} 完了', ko: '{done}/{total} 완료', pt: '{done}/{total} concluídos',
        ru: 'выполнено {done}/{total}', zh: '已完成 {done}/{total}',
    },
    cardsPlanNow: {
        en: 'now: {step}', fr: 'en cours : {step}', de: 'jetzt: {step}', es: 'ahora: {step}', it: 'ora: {step}',
        ja: '実行中：{step}', ko: '현재: {step}', pt: 'agora: {step}', ru: 'сейчас: {step}', zh: '当前：{step}',
    },
} satisfies Record<string, CardWord>;

type WordKey = keyof typeof W;

const say = (config: AparteConfig, key: WordKey, vars?: Record<string, string>) => word(config, key, W[key], vars);

const STATUS_WORD: Record<PlanStatus, WordKey> = {
    pending: 'cardsPlanStatusPending',
    'in-progress': 'cardsPlanStatusInProgress',
    done: 'cardsPlanStatusDone',
    failed: 'cardsPlanStatusFailed',
    skipped: 'cardsPlanStatusSkipped',
    blocked: 'cardsPlanStatusBlocked',
};

/** Fifty, sub-steps counted: past that a plan is a backlog, not something to follow. */
export const PLAN_STEPS_SHOWN = 50;

// ── Reading ──────────────────────────────────────────────────────────────────

type Raw = Record<string, unknown>;

const isObject = (value: unknown): value is Raw => !!value && typeof value === 'object' && !Array.isArray(value);

const notNull = <T>(value: T | null | undefined): value is T => value !== null && value !== undefined;

/** The first of `keys` that `r` has a value for. */
function pick(r: Raw, keys: readonly string[]): unknown {
    for (const key of keys) if (r[key] !== undefined && r[key] !== null && r[key] !== '') return r[key];
    return undefined;
}

/** The words tools use for each status, written lower-case with dashes. */
const STATUS_ALIASES: Record<PlanStatus, readonly string[]> = {
    pending: ['pending', 'todo', 'to-do', 'open', 'queued', 'planned', 'not-started', 'notstarted', 'new', 'waiting', 'scheduled', 'upcoming', 'ready', 'idle', 'backlog'],
    'in-progress': ['in-progress', 'inprogress', 'progress', 'doing', 'running', 'active', 'current', 'started', 'working', 'executing', 'ongoing', 'processing', 'in-flight'],
    done: ['done', 'completed', 'complete', 'success', 'succeeded', 'successful', 'finished', 'ok', 'passed', 'resolved', 'closed', 'checked'],
    failed: ['failed', 'fail', 'failure', 'error', 'errored', 'aborted', 'timeout', 'timed-out', 'crashed'],
    skipped: ['skipped', 'skip', 'cancelled', 'canceled', 'omitted', 'not-needed', 'wont-do', "won't-do", 'wontdo', 'obsolete', 'dropped'],
    blocked: ['blocked', 'on-hold', 'onhold', 'paused', 'stuck', 'held', 'needs-input', 'needs-approval', 'awaiting-input', 'awaiting-approval'],
};

const STATUS_OF = new Map<string, PlanStatus>(
    (Object.entries(STATUS_ALIASES) as Array<[PlanStatus, readonly string[]]>).flatMap(([status, words]) => words.map((w) => [w, status] as const)),
);

/** A status from what a tool wrote — `"in_progress"`, `"Running"`, `true` — or `undefined` for a word it does not know. */
export function readStatus(value: unknown): PlanStatus | undefined {
    if (typeof value === 'boolean') return value ? 'done' : 'pending';
    if (typeof value !== 'string') return undefined;
    return STATUS_OF.get(value.trim().toLowerCase().replace(/[\s_]+/g, '-'));
}

const STATUS_KEYS = ['status', 'state', 'stage', 'phase'] as const;
const DONE_FLAGS = ['done', 'completed', 'complete', 'checked', 'finished', 'isDone', 'is_done', 'isCompleted', 'is_completed'] as const;
const ACTIVE_FLAGS = ['active', 'running', 'current', 'inProgress', 'in_progress'] as const;
const TITLE_KEYS = ['title', 'content', 'name', 'label', 'text', 'task', 'step', 'action', 'description'] as const;
const ACTIVE_FORM_KEYS = ['activeForm', 'active_form', 'activeTitle', 'active_title'] as const;
const DETAIL_KEYS = ['detail', 'details', 'description', 'note', 'notes', 'summary', 'result', 'output', 'observation', 'message', 'reason'] as const;
const START_KEYS = ['startedAt', 'started_at', 'startTime', 'start_time', 'startDate', 'start_date', 'start', 'begin'] as const;
const END_KEYS = ['finishedAt', 'finished_at', 'completedAt', 'completed_at', 'endedAt', 'ended_at', 'endTime', 'end_time', 'doneAt', 'done_at', 'end'] as const;
const SECONDS_KEYS = ['duration', 'durationSeconds', 'duration_seconds', 'durationSec', 'elapsed', 'seconds', 'took'] as const;
const MS_KEYS = ['durationMs', 'duration_ms', 'elapsedMs', 'elapsed_ms', 'tookMs', 'took_ms'] as const;
const SUB_KEYS = ['substeps', 'subSteps', 'sub_steps', 'subtasks', 'subTasks', 'children', 'steps', 'todos', 'items', 'checklist'] as const;
const LIST_KEYS = ['steps', 'todos', 'tasks', 'items', 'checklist', 'stages', 'phases', 'subtasks', 'plan'] as const;
const PAST_KEYS = ['past_steps', 'pastSteps', 'completed_steps', 'completedSteps'] as const;
const PLAN_TITLE_KEYS = ['title', 'name', 'heading'] as const;
const GOAL_KEYS = ['goal', 'objective', 'task', 'input', 'query', 'request', 'description', 'explanation', 'summary'] as const;
const UPDATED_KEYS = ['updatedAt', 'updated_at', 'lastUpdated', 'last_updated', 'asOf', 'as_of', 'timestamp'] as const;

/** A status the object says, by a word or by a flag. */
function statusOf(r: Raw): PlanStatus | undefined {
    const said = readStatus(pick(r, STATUS_KEYS));
    if (said) return said;
    if (r['failed'] === true || r['error'] === true || str(r['error'])) return 'failed';
    if (r['skipped'] === true || r['cancelled'] === true || r['canceled'] === true) return 'skipped';
    if (r['blocked'] === true) return 'blocked';
    const active = ACTIVE_FLAGS.some((key) => r[key] === true);
    for (const key of DONE_FLAGS) {
        if (typeof r[key] === 'boolean') return r[key] ? 'done' : active ? 'in-progress' : 'pending';
    }
    return active ? 'in-progress' : undefined;
}

/**
 * A parent's status from its sub-steps, when it says none: done once they all are,
 * under way as soon as one started, failed when one failed and nothing else runs.
 */
function fromSubsteps(subs: PlanStep[]): PlanStatus {
    const has = (status: PlanStatus) => subs.some((s) => s.status === status);
    if (subs.every((s) => s.status === 'done' || s.status === 'skipped')) return has('done') ? 'done' : 'skipped';
    if (has('in-progress')) return 'in-progress';
    if (has('failed')) return 'failed';
    if (has('done') || has('skipped')) return 'in-progress';
    if (has('blocked')) return 'blocked';
    return 'pending';
}

/** `- [x] Write the tests` → its title and status; a list marker and a checkbox are both optional. */
const LINE = /^\s*(?:(?:[-*+•]|\d+[.)])\s+)?(?:\[([ xX✓✔>~!-])\]\s*)?(.*?)\s*$/;
/** A line that is a list item: a marker, or a checkbox. */
const ITEM = /^\s*(?:(?:[-*+•]|\d+[.)])\s+|\[[ xX✓✔>~!-]\])/;

const BOX: Record<string, PlanStatus> = { ' ': 'pending', x: 'done', X: 'done', '✓': 'done', '✔': 'done', '>': 'in-progress', '!': 'failed', '-': 'skipped', '~': 'blocked' };

function checkbox(text: string): { title: string; status?: PlanStatus } | null {
    const match = LINE.exec(text)!;
    const title = match[2]!;
    if (!title) return null;
    return { title, ...(match[1] !== undefined ? { status: BOX[match[1]]! } : {}) };
}

/**
 * A Markdown checklist or list, as a model writes it in text: one step per item, an item
 * indented under another is its sub-step, a first line that is no item is the title.
 * `null` when a line further down is not an item — that is prose, not a plan.
 */
function parseText(text: string): { title?: string; steps: PlanStep[] } | null {
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    let title: string | undefined;
    const steps: PlanStep[] = [];
    for (const [index, line] of lines.entries()) {
        if (!ITEM.test(line)) {
            if (index > 0) return null;
            // A model titles its list with a heading as often as with a sentence: `## Deploy plan`.
            title = line.trim().replace(/^#{1,6}\s+/, '').replace(/:$/, '') || undefined;
            continue;
        }
        const step = readStep(line, 1);
        if (!step) continue;
        const parent = steps[steps.length - 1];
        // Indented by two spaces or more, or by a tab — one character, a whole level.
        if (/^(?:\t|\s{2,})/.test(line) && parent) (parent.substeps ??= []).push(step);
        else steps.push(step);
    }
    return steps.length ? { ...(title ? { title } : {}), steps } : null;
}

/** One step from whatever a tool wrote, or `null` without a title. `depth` 1 reads no sub-steps. */
function readStep(raw: unknown, depth: number, forced?: PlanStatus): PlanStep | null {
    if (typeof raw === 'string' || typeof raw === 'number') {
        const line = checkbox(String(raw));
        return line ? { title: line.title, status: line.status ?? forced ?? 'pending' } : null;
    }
    if (Array.isArray(raw)) {
        // A `[step, result]` pair, as LangGraph's `past_steps` keeps them. The result is not
        // drawn: it arrives as the step completes, so as a detail it would add a line to every
        // step at that moment — and it is the executor's whole answer, not a line about the step.
        return readStep(raw[0], depth, forced);
    }
    if (!isObject(raw)) return null;
    const r = raw;
    // Only a text names a step: `step: 3` is an index, not a title.
    const titleKey = TITLE_KEYS.find((key) => typeof r[key] === 'string' && (r[key] as string).trim());
    let title = titleKey ? (r[titleKey] as string).trim() : undefined;
    if (!title) return null;

    const subsRaw = depth === 0 ? SUB_KEYS.map((key) => r[key]).find(Array.isArray) : undefined;
    const substeps = subsRaw ? subsRaw.map((item) => readStep(item, 1)).filter(notNull) : [];

    const startedAt = toDate(pick(r, START_KEYS)) ?? undefined;
    const finishedAt = toDate(pick(r, END_KEYS)) ?? undefined;
    const status = statusOf(r) ?? forced
        ?? (substeps.length ? fromSubsteps(substeps) : finishedAt ? 'done' : startedAt ? 'in-progress' : 'pending');

    // "Running the tests" while it runs, "Run the tests" before and after — Claude Code's pair.
    // The wording not shown is kept too, for the title to hold its room.
    const active = str(pick(r, ACTIVE_FORM_KEYS));
    let altTitle: string | undefined;
    if (active && active !== title) {
        if (status === 'in-progress') [title, altTitle] = [active, title];
        else altTitle = active;
    }

    const error = str(r['error']);
    const detail = (status === 'failed' ? error : undefined)
        ?? str(pick(r, DETAIL_KEYS.filter((key) => key !== titleKey)));

    const seconds = num(pick(r, SECONDS_KEYS));
    const ms = num(pick(r, MS_KEYS));
    let duration = seconds ?? (ms !== undefined ? ms / 1000 : undefined);
    if (duration === undefined && startedAt && finishedAt && finishedAt >= startedAt) duration = (finishedAt.getTime() - startedAt.getTime()) / 1000;
    if (duration !== undefined && duration < 0) duration = undefined;
    const id = str(pick(r, ['id', 'key', 'uuid']));

    return {
        title,
        ...(altTitle ? { altTitle } : {}),
        status,
        ...(detail ? { detail } : {}),
        ...(startedAt ? { startedAt } : {}),
        ...(finishedAt ? { finishedAt } : {}),
        ...(duration !== undefined ? { duration } : {}),
        ...(substeps.length ? { substeps } : {}),
        ...(id ? { id } : {}),
    };
}

/** At most fifty steps, sub-steps counted: a long list keeps its first steps whole, then stops. */
function cap(steps: PlanStep[]): PlanStep[] {
    let left = PLAN_STEPS_SHOWN;
    const kept: PlanStep[] = [];
    for (const step of steps) {
        if (left <= 0) break;
        left -= 1;
        if (!step.substeps) {
            kept.push(step);
            continue;
        }
        const substeps = step.substeps.slice(0, left);
        left -= substeps.length;
        const copy: PlanStep = { ...step, substeps };
        if (!substeps.length) delete copy.substeps;
        kept.push(copy);
    }
    return kept;
}

/**
 * The card's data from the loose shape `map` returns — `{ title, goal, steps }` (also
 * `todos`, `tasks`, `items`, `plan`…), a list of steps or of strings, a Markdown
 * checklist, LangGraph's `{ plan, past_steps }` — or `null` when it holds no step.
 */
export function readPlan(raw: unknown): PlanData | null {
    if (typeof raw === 'string') {
        const parsed = parseText(raw);
        return parsed ? { ...(parsed.title ? { title: parsed.title } : {}), steps: cap(parsed.steps) } : null;
    }
    if (Array.isArray(raw)) {
        const steps = cap(raw.map((item) => readStep(item, 0)).filter(notNull));
        return steps.length ? { steps } : null;
    }
    if (!isObject(raw)) return null;
    const r = raw;
    const title = str(pick(r, PLAN_TITLE_KEYS));
    const goal = str(pick(r, GOAL_KEYS));
    const updatedAt = toDate(pick(r, UPDATED_KEYS)) ?? undefined;
    const meta = { ...(title ? { title } : {}), ...(goal ? { goal } : {}), ...(updatedAt ? { updatedAt } : {}), ...(r['timed'] === true ? { timed: true } : {}) };

    // A plan wrapped once more: `{ plan: { title, steps } }`. The outer words fill what it lacks.
    if (isObject(r['plan'])) {
        const inner = readPlan(r['plan']);
        return inner ? { ...meta, ...inner } : null;
    }

    const past = PAST_KEYS.map((key) => r[key]).find(Array.isArray) ?? [];
    const list = LIST_KEYS.map((key) => r[key]).find((value) => Array.isArray(value) || typeof value === 'string');
    const ahead = Array.isArray(list) ? list.map((item) => readStep(item, 0)).filter(notNull)
        : typeof list === 'string' ? parseText(list)?.steps ?? []
        : [];
    const steps = cap([...past.map((item) => readStep(item, 0, 'done')).filter(notNull), ...ahead]);
    return steps.length ? { ...meta, steps } : null;
}

// ── Progress ─────────────────────────────────────────────────────────────────

const allSteps = (data: PlanData) => data.steps.flatMap((step) => [step, ...(step.substeps ?? [])]);

/** Seconds from the first start to the last date the plan holds, else the durations added up. */
function elapsedOf(data: PlanData): number | undefined {
    const steps = allSteps(data);
    const starts = steps.map((s) => s.startedAt?.getTime()).filter(notNull);
    if (starts.length) {
        const ends = steps.flatMap((s) => [s.startedAt?.getTime(), s.finishedAt?.getTime()]).filter(notNull);
        if (data.updatedAt) ends.push(data.updatedAt.getTime());
        const span = (Math.max(...ends) - Math.min(...starts)) / 1000;
        if (span > 0) return span;
    }
    const sum = data.steps.reduce((total, s) => total + (s.duration ?? (s.substeps ?? []).reduce((t, sub) => t + (sub.duration ?? 0), 0)), 0);
    return sum > 0 ? sum : undefined;
}

/** How far the plan has got, counted over its top-level steps. */
export function planProgress(data: PlanData): PlanProgress {
    const steps = data.steps;
    const count = (status: PlanStatus) => steps.filter((s) => s.status === status).length;
    const total = steps.length;
    const done = count('done');
    const skipped = count('skipped');
    const finished = done + skipped;
    let currentIndex = steps.findIndex((s) => s.status === 'in-progress');
    if (currentIndex < 0) currentIndex = steps.findIndex((s) => s.status === 'pending');
    if (currentIndex < 0) currentIndex = steps.findIndex((s) => s.status === 'blocked');
    const stoppedIndex = currentIndex < 0 ? steps.findIndex((s) => s.status === 'failed') : -1;
    const elapsed = elapsedOf(data);
    return {
        total,
        done,
        skipped,
        failed: count('failed'),
        blocked: count('blocked'),
        finished,
        ratio: total ? finished / total : 0,
        ...(currentIndex >= 0 ? { current: steps[currentIndex]!, currentIndex } : {}),
        ...(stoppedIndex >= 0 ? { stoppedIndex } : {}),
        ...(elapsed !== undefined ? { elapsed } : {}),
    };
}

/** A plan that says when its steps ran, or that it will: its rows keep a slot for the time. */
const isTimed = (data: PlanData) => data.timed === true || allSteps(data).some((s) => s.startedAt || s.finishedAt || s.duration !== undefined);

// ── Writing times ────────────────────────────────────────────────────────────

/** A duration, its two largest units in their narrow form: `45s`, `1m 20s`, `2h 5m`, `0.4s`. */
export function durationText(config: AparteConfig, seconds: number): string {
    const tag = intlTag(config);
    const unit = (value: number, name: string, digits = 0) =>
        new Intl.NumberFormat(tag, { style: 'unit', unit: name, unitDisplay: 'narrow', maximumFractionDigits: digits }).format(value);
    const s = Math.max(0, seconds);
    if (s < 10 && !Number.isInteger(s)) return unit(s, 'second', 1);
    let rest = Math.round(s);
    if (rest < 60) return unit(rest, 'second');
    const parts: string[] = [];
    let slots = 0;
    for (const [name, size] of [['day', 86_400], ['hour', 3_600], ['minute', 60], ['second', 1]] as const) {
        const n = Math.floor(rest / size);
        rest -= n * size;
        if (n > 0) parts.push(unit(n, name));
        if (n > 0 || slots) slots += 1;
        if (slots === 2) break;
    }
    try {
        return new Intl.ListFormat(tag, { type: 'unit', style: 'narrow' }).format(parts);
    } catch {
        return parts.join(' ');
    }
}

/** A duration as `<time datetime>` takes it: `PT80S`. */
const isoDuration = (seconds: number) => `PT${Math.round(seconds * 1000) / 1000}S`;

/** The time of day a step started; with its seconds when the whole run fits in an hour, where they tell steps apart. */
function clockText(config: AparteConfig, date: Date, seconds: boolean): string {
    return new Intl.DateTimeFormat(intlTag(config), { hour: 'numeric', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) }).format(date);
}

/** Whether the plan's dates all fall within an hour. */
function withinAnHour(data: PlanData): boolean {
    const times = allSteps(data).flatMap((s) => [s.startedAt?.getTime(), s.finishedAt?.getTime()]).filter(notNull);
    return !times.length || Math.max(...times) - Math.min(...times) < 3_600_000;
}

// ── Drawing ──────────────────────────────────────────────────────────────────

const n = (config: AparteConfig, value: number) => formatNumber(config, value);
const percentOf = (part: number, total: number) => `${total ? (part / total) * 100 : 0}%`;
const FINISHED = new Set<PlanStatus>(['done', 'failed', 'skipped']);

function statusGlyph(status: PlanStatus, className = 'aparte-plan__glyph'): HTMLElement {
    return glyph(STATUS_GLYPHS[status], `aparte-rich-card__glyph ${className}`);
}

/**
 * The step's title, holding the room of its bold form: the text and an invisible bold
 * copy share one grid cell, so the step that starts running turns bold without its line
 * growing or wrapping differently — the row the reader is looking at does not move. A step
 * with two wordings ("Update" / "Updating the reference pages") holds the room of the
 * other one too, in a second invisible copy.
 */
function titleOf(step: PlanStep): HTMLElement {
    return el('span', { class: 'aparte-plan__step-title', attrs: { 'data-text': step.title, 'data-alt': step.altTitle } },
        el('span', { class: 'aparte-plan__step-title-text', text: step.title }));
}

/** The status in words, for a screen reader: the glyph and its colour say it to the eye only. */
function statusText(ctx: CardContext, step: PlanStep): HTMLElement {
    const node = el('span', { class: 'aparte-sr-only aparte-plan__status' });
    ctx.bind(node, () => ` (${say(ctx.config, STATUS_WORD[step.status])})`);
    return node;
}

const detailOf = (step: PlanStep) => (step.detail ? el('div', { class: 'aparte-plan__detail', text: step.detail }) : null);

/**
 * The widest duration the language writes in two units — `59m 59s` in English,
 * `59 Min., 59 Sek.` in German. The checklist's duration slot holds its width (an invisible
 * copy, `data-reserve`): a fixed `3.5rem` held English and not German, so the first long
 * duration widened its slot and could wrap its title onto a second line.
 */
function widestDuration(config: AparteConfig): string {
    return [3_599, 86_340, 604_799].map((s) => durationText(config, s)).reduce((a, b) => (b.length > a.length ? b : a));
}

/** How long a finished step took — always drawn in a timed plan, empty until it finished, so filling it moves nothing. */
function durationOf(ctx: CardContext, step: PlanStep): HTMLElement {
    const shown = step.duration !== undefined && FINISHED.has(step.status) ? step.duration : undefined;
    const node = el('time', { class: 'aparte-plan__duration', attrs: { datetime: shown !== undefined ? isoDuration(shown) : undefined } });
    if (shown !== undefined) ctx.bind(node, () => durationText(ctx.config, shown));
    ctx.bind(node, () => widestDuration(ctx.config), 'data-reserve');
    return node;
}

/** The header: the title or the goal, "3 of 7 done", what was skipped or failed, the time taken — and, with `bar`, the bar. */
function head(ctx: CardContext, data: PlanData, progress: PlanProgress, bar: boolean): HTMLElement {
    const heading = data.title ?? data.goal;
    const count = el('span', { class: 'aparte-plan__count' });
    ctx.bind(count, () => say(ctx.config, 'cardsPlanProgress', { done: n(ctx.config, progress.done), total: n(ctx.config, progress.total) }));
    const note = (kind: 'skipped' | 'failed', key: WordKey, value: number) => {
        if (!value) return null;
        const node = el('span', { class: 'aparte-plan__note', attrs: { 'data-kind': kind } });
        ctx.bind(node, () => say(ctx.config, key, { n: n(ctx.config, value) }));
        return node;
    };
    let elapsed: HTMLElement | null = null;
    if (progress.elapsed !== undefined) {
        const seconds = progress.elapsed;
        const text = el('span', { class: 'aparte-plan__elapsed-text' });
        ctx.bind(text, () => say(ctx.config, 'cardsPlanElapsed', { time: durationText(ctx.config, seconds) }));
        elapsed = el('span', { class: 'aparte-plan__elapsed' }, glyph(CLOCK, 'aparte-rich-card__glyph aparte-plan__clock'), text);
    }
    let track: HTMLElement | null = null;
    if (bar) {
        track = el('div', { class: 'aparte-plan__bar', attrs: { 'aria-hidden': 'true', 'data-complete': progress.total > 0 && progress.finished === progress.total } },
            el('span', { class: 'aparte-plan__bar-done' }),
            el('span', { class: 'aparte-plan__bar-skipped' }));
        track.style.setProperty('--aparte-plan-done-share', percentOf(progress.done, progress.total));
        track.style.setProperty('--aparte-plan-skipped-share', percentOf(progress.skipped, progress.total));
    }
    return el('div', { class: 'aparte-plan__head' },
        heading ? el('div', { class: 'aparte-plan__heading' },
            el('div', { class: 'aparte-plan__title', text: heading }),
            data.title && data.goal ? el('div', { class: 'aparte-plan__goal', text: data.goal }) : null) : null,
        el('div', { class: 'aparte-plan__meter' },
            count,
            note('skipped', 'cardsPlanSkipped', progress.skipped),
            note('failed', 'cardsPlanFailed', progress.failed),
            elapsed),
        track);
}

/** A row of the checklist, and its sub-steps under it. */
function stepNode(ctx: CardContext, step: PlanStep, { timed, current = false, sub = false }: { timed: boolean; current?: boolean; sub?: boolean }): HTMLLIElement {
    const row = el('div', { class: 'aparte-plan__row' },
        statusGlyph(step.status),
        el('div', { class: 'aparte-plan__text' }, titleOf(step), statusText(ctx, step), detailOf(step)),
        timed ? durationOf(ctx, step) : null);
    const node = el('li', {
        class: `aparte-plan__step${sub ? ' aparte-plan__step--sub' : ''}`,
        attrs: { 'data-status': step.status, 'aria-current': current ? 'step' : undefined, 'data-step-id': step.id },
    }, row);
    if (step.substeps?.length) {
        node.append(el('ol', { class: 'aparte-plan__substeps', attrs: { role: 'list' } },
            ...step.substeps.map((s) => stepNode(ctx, s, { timed, sub: true }))));
    }
    return node;
}

/** The `checklist` variant: the header and its bar, then a row per step. */
function checklist(ctx: CardContext, data: PlanData, progress: PlanProgress): Node[] {
    const timed = isTimed(data);
    const list = el('ol', { class: 'aparte-plan__steps', attrs: { role: 'list', 'data-timed': timed } },
        ...data.steps.map((step, i) => stepNode(ctx, step, { timed, current: i === progress.currentIndex })));
    return [head(ctx, data, progress, true), list];
}

/**
 * The time line of a timeline step: when it started, and how long it took. In a timed plan
 * every step has it, empty until it starts — the steps keep one rhythm, and a step that
 * starts fills its line instead of growing one.
 */
function timesOf(ctx: CardContext, step: PlanStep, seconds: boolean): HTMLElement {
    const started = step.startedAt;
    const start = el('time', { class: 'aparte-plan__start', attrs: { datetime: started?.toISOString() } });
    if (started) ctx.bind(start, () => clockText(ctx.config, started, seconds));
    return el('div', { class: 'aparte-plan__meta' }, start, durationOf(ctx, step));
}

/** The `timeline` variant: a rail with a node per step, its time beside it. */
function timeline(ctx: CardContext, data: PlanData, progress: PlanProgress): Node[] {
    const timed = isTimed(data);
    const seconds = withinAnHour(data);
    const list = el('ol', { class: 'aparte-plan__timeline', attrs: { role: 'list', 'data-timed': timed } });
    data.steps.forEach((step, i) => {
        const node = el('span', { class: 'aparte-plan__node' },
            glyph(step.status === 'in-progress' ? NODE_CURRENT : STATUS_GLYPHS[step.status], 'aparte-rich-card__glyph aparte-plan__node-glyph'));
        const body = el('div', { class: 'aparte-plan__event-body' },
            titleOf(step),
            statusText(ctx, step),
            timed ? timesOf(ctx, step, seconds) : null,
            detailOf(step),
            step.substeps?.length
                ? el('ol', { class: 'aparte-plan__substeps', attrs: { role: 'list' } }, ...step.substeps.map((s) => stepNode(ctx, s, { timed: false, sub: true })))
                : null);
        list.append(el('li', {
            class: 'aparte-plan__event',
            attrs: { 'data-status': step.status, 'aria-current': i === progress.currentIndex ? 'step' : undefined, 'data-step-id': step.id },
        }, node, body));
    });
    return [head(ctx, data, progress, false), list];
}

const SVG = 'http://www.w3.org/2000/svg';

/** The progress ring: what is done, then what was skipped, round a faint track. Numbers only. */
function ring(progress: PlanProgress): HTMLElement {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'aparte-plan__ring-svg');
    const arc = (cls: string, share?: number, offset = 0) => {
        const circle = document.createElementNS(SVG, 'circle');
        for (const [name, value] of [['cx', '12'], ['cy', '12'], ['r', '9.5'], ['pathLength', '100'], ['class', cls]]) circle.setAttribute(name!, value!);
        if (share !== undefined) {
            circle.setAttribute('stroke-dasharray', `${share} 100`);
            circle.setAttribute('stroke-dashoffset', String(-offset));
        }
        return circle;
    };
    const done = progress.total ? (progress.done / progress.total) * 100 : 0;
    const skipped = progress.total ? (progress.skipped / progress.total) * 100 : 0;
    svg.append(arc('aparte-plan__ring-track'), arc('aparte-plan__ring-done', done), arc('aparte-plan__ring-skipped', skipped, done));
    return el('span', { class: 'aparte-plan__ring', attrs: { 'aria-hidden': 'true', 'data-complete': progress.total > 0 && progress.finished === progress.total } }, svg);
}

/**
 * The `compact` variant: one line — the step under way ("Step 3 of 7: Running the tests"),
 * else where it stopped, else the plan's name and "All steps done" — a ring and the percentage.
 */
function compact(ctx: CardContext, data: PlanData, progress: PlanProgress): Node[] {
    const index = progress.currentIndex ?? progress.stoppedIndex;
    const focus = index !== undefined ? data.steps[index] : undefined;
    const step = el('span', { class: 'aparte-plan__compact-step' });
    const parts: HTMLElement[] = [];
    if (focus) {
        ctx.bind(step, () => say(ctx.config, 'cardsPlanStepNow', { n: n(ctx.config, index! + 1), total: n(ctx.config, progress.total) }));
        parts.push(step, el('span', { class: 'aparte-plan__compact-title', text: focus.title }));
    } else {
        ctx.word(step, 'cardsPlanAllDone', W.cardsPlanAllDone);
        const name = data.title ?? data.goal;
        if (name) parts.push(el('span', { class: 'aparte-plan__compact-title', text: name }));
        parts.push(step);
    }
    const percent = el('span', { class: 'aparte-plan__percent' });
    ctx.bind(percent, () => formatPercent(ctx.config, progress.ratio));
    const status: PlanStatus = focus ? focus.status : 'done';
    return [el('div', { class: 'aparte-plan__compact', attrs: { 'data-status': status } },
        statusGlyph(status, 'aparte-plan__glyph aparte-plan__compact-glyph'),
        el('span', { class: 'aparte-plan__compact-text' }, ...parts),
        ring(progress),
        percent)];
}

function render(data: PlanData, ctx: CardContext<PlanVariant>): Node[] {
    const progress = planProgress(data);
    if (ctx.variant === 'timeline') return timeline(ctx, data, progress);
    if (ctx.variant === 'compact') return compact(ctx, data, progress);
    return checklist(ctx, data, progress);
}

function skeleton(partial: Partial<PlanData> | null, ctx: CardContext<PlanVariant>): Node[] {
    // The call's input may already be the plan — a todo tool's is: draw it while it runs.
    if (partial?.steps?.length) return render(partial as PlanData, ctx);
    const block = (cls: string, kind: 'text' | 'rect' | 'circle' = 'rect') =>
        el('span', { class: `aparte-skeleton aparte-skeleton--${kind} ${cls}`, attrs: { 'aria-hidden': 'true' } });
    const heading = partial?.title ?? partial?.goal;
    if (ctx.variant === 'compact') {
        return [el('div', { class: 'aparte-plan__compact' },
            block('aparte-plan__sk-glyph', 'circle'),
            el('span', { class: 'aparte-plan__compact-text' },
                heading ? el('span', { class: 'aparte-plan__compact-title', text: heading }) : block('aparte-plan__sk-line', 'text')),
            block('aparte-plan__sk-ring', 'circle'))];
    }
    const top = el('div', { class: 'aparte-plan__head' },
        heading ? el('div', { class: 'aparte-plan__heading' }, el('div', { class: 'aparte-plan__title', text: heading })) : block('aparte-plan__sk-title', 'text'),
        el('div', { class: 'aparte-plan__meter' }, block('aparte-plan__sk-count', 'text')),
        ctx.variant === 'checklist' ? el('div', { class: 'aparte-plan__bar', attrs: { 'aria-hidden': 'true' } }) : null);
    const rows = [0, 1, 2, 3];
    if (ctx.variant === 'timeline') {
        return [top, el('ol', { class: 'aparte-plan__timeline', attrs: { 'aria-hidden': 'true' } }, ...rows.map(() =>
            el('li', { class: 'aparte-plan__event', attrs: { 'data-status': 'pending' } },
                el('span', { class: 'aparte-plan__node' }, block('aparte-plan__sk-node', 'circle')),
                el('div', { class: 'aparte-plan__event-body' }, block('aparte-plan__sk-line', 'text'), block('aparte-plan__sk-meta', 'text')))))];
    }
    return [top, el('ol', { class: 'aparte-plan__steps', attrs: { 'aria-hidden': 'true' } }, ...rows.map(() =>
        el('li', { class: 'aparte-plan__step' },
            el('div', { class: 'aparte-plan__row' }, block('aparte-plan__sk-glyph', 'circle'), block('aparte-plan__sk-line', 'text')))))];
}

function cardLabel(data: Partial<PlanData> | null, ctx: CardContext): string {
    return data?.title ?? data?.goal ?? say(ctx.config, 'cardsPlanTitle');
}

/** The marker a step's line carries in the fallback — and which `readPlan` reads back. */
const MARK: Record<PlanStatus, string> = { done: '[x]', pending: '[ ]', 'in-progress': '[>]', failed: '[!]', skipped: '[-]', blocked: '[~]' };

/** A detail kept short enough for one line of the fallback. */
const clip = (text: string) => (text.length > 120 ? `${text.slice(0, 119).trimEnd()}…` : text);

/**
 * "Deploy: 3/7 done — now: Run the tests", then a line per step with its marker — what a
 * model reads back, and what a reader without the card gets.
 */
function fallback(data: PlanData, ctx: CardContext): string {
    const progress = planProgress(data);
    const summary = say(ctx.config, 'cardsPlanSummary', { done: n(ctx.config, progress.done), total: n(ctx.config, progress.total) });
    const now = progress.current ? ` — ${say(ctx.config, 'cardsPlanNow', { step: progress.current.title })}` : '';
    const line = (step: PlanStep, indent: string) => {
        const why = (step.status === 'failed' || step.status === 'blocked') && step.detail ? ` — ${clip(step.detail)}` : '';
        return `${indent}- ${MARK[step.status]} ${step.title}${why}`;
    };
    const lines = data.steps.flatMap((step) => [line(step, ''), ...(step.substeps ?? []).map((sub) => line(sub, '  '))]);
    return [`${cardLabel(data, ctx)}: ${summary}${now}`, ...lines].join('\n');
}

export const planCard = defineCard<PlanData, PlanVariant>({
    name: 'plan',
    variants: ['checklist', 'timeline', 'compact'],
    styles: planStyles,
    icon: PLAN,
    normalize: readPlan,
    render,
    skeleton,
    label: cardLabel,
    fallback,
    partial: (input) => {
        const plan = readPlan(input);
        if (plan) return plan;
        const about = str(input['title'] ?? input['goal'] ?? input['task'] ?? input['objective'] ?? input['query']);
        return about ? { title: about } : null;
    },
});

/** Draw an agent's plan or task list as this card — returns the function that stops it. */
export function setupPlanCard(options: CardSetupOptions<PlanData, PlanVariant> = {}): () => void {
    return planCard.setup(options);
}
