/**
 * @aparte/plugin-cards/score — a tool's matches, drawn as a scoreboard: football,
 * basketball, tennis, rugby, hockey, baseball, American football, any other sport.
 *
 *   import { setupScoreCard } from '@aparte/plugin-cards/score';
 *
 *   setupScoreCard({ tool: 'get_match', map: (result) => result.response });
 *
 * One match, a list of them (a round, a scoreboard), or `{ title, matches: [...] }`. Three
 * variants of one card: `card` (the two teams facing each other, the score big between
 * them, the state of play under it), `compact` (one row per match, the teams stacked with
 * their scores at the end) and `detail` (the card's board, then the score by period and
 * the match's events, each on the side of the team it belongs to).
 *
 * Several matches are always rows, whatever the variant: a scoreboard is read down a
 * column, one glance per match, and a carousel would hide all but one score behind a swipe.
 *
 * Your tool keeps its own fields: `readMatches` reads the usual shapes — API-Football
 * (`fixture`, `teams`, `goals`, the `FT`/`HT`/`1H`/`NS` codes), football-data.org
 * (`homeTeam`, `score.fullTime`, `utcDate`, `goals`/`bookings`), ESPN (`competitions[0]
 * .competitors[]` with `homeAway`, `linescores`, `status.type`), TheSportsDB (`strHomeTeam`,
 * `intHomeScore`) and what a model writes by hand — and `map` says the rest.
 */
import type { AparteConfig } from '@aparte/core';
import { defineCard, type CardContext, type CardSetupOptions } from '../kit/define.js';
import { el, glyph, num, str, webUrl } from '../kit/dom.js';
import { formatDay, formatHour, formatNumber, toDate } from '../kit/format.js';
import { intlTag, word, type CardWord } from '../kit/strings.js';
import { CHEVRON, EVENT_GLYPHS, PIN, SPORT_GLYPHS, TROPHY, TV } from './icons.js';
import scoreStyles from './score.css?raw';

export type ScoreVariant = 'card' | 'compact' | 'detail';

/** Where a match stands. A status a tool writes that is none of these is kept as its text. */
export type MatchStatus = 'scheduled' | 'live' | 'halftime' | 'final' | 'postponed' | 'cancelled';

/** The sport, which picks the match's glyph and how its end is said ("Full time", "Final"). */
export type Sport = keyof typeof SPORT_GLYPHS;

export type MatchSide = 'home' | 'away';

export type MatchEventType = keyof typeof EVENT_GLYPHS;

/** A team as `map` returns it. Only `name` is needed. */
export interface TeamInput {
    name: string;
    /** "LOSC", "LIL" — the monogram's letters when there is no logo, and the name on a narrow row. */
    shortName?: string;
    /** An `http(s)` image; anything else is ignored and the monogram is drawn. */
    logo?: string;
    score?: number | string;
    /** The team's record, as the sport writes it: "12-4", "W8 D2 L1". */
    record?: string;
    /** A CSS hex colour the team wears (`#c8102e`, `c8102e`, `#c12`) — anything else is ignored. */
    color?: string;
}

/** One period of play: a quarter, a half, a set, an inning. */
export interface MatchPeriodInput {
    label?: string;
    home?: number | string;
    away?: number | string;
}

export interface MatchEventInput {
    /** "23'", "90+2'", or a number of minutes. */
    minute?: string | number;
    team: MatchSide;
    type: MatchEventType;
    player?: string;
    /** A line beside the player: the assist, the player going off. */
    detail?: string;
}

/** A match as `map` returns it. Only the two teams' names are needed. */
export interface MatchInput {
    home: TeamInput | string;
    away: TeamInput | string;
    /** One of `MatchStatus`, a feed's code (`FT`, `HT`, `1H`, `NS`, `PST`, `IN_PLAY`…), or any text. */
    status?: MatchStatus | string;
    /** The match clock while it is live: "67'", "Q3 4:12". A number is minutes. */
    clock?: string | number;
    /** The period being played, when the clock does not already say it. */
    period?: string | number;
    /** Kick-off: an ISO string, an epoch, or a Date. */
    startTime?: string | number | Date;
    competition?: string;
    /** Another name for `competition`. */
    league?: string;
    round?: string;
    venue?: string;
    sport?: Sport | string;
    periods?: MatchPeriodInput[];
    events?: MatchEventInput[];
    /** Who won; worked out from a finished match's score when it is not given. */
    winner?: MatchSide;
    /** Where to watch it: "Canal+", or several. */
    broadcast?: string | string[];
    /** The match's own page. */
    url?: string;
}

/** What `map` returns: one match, a scoreboard of them, or a scoreboard with a heading. */
export type ScoreInput = MatchInput | MatchInput[] | { title?: string; matches: MatchInput[] };

/** A team as the card draws it, once read. */
export interface Team {
    name: string;
    shortName?: string;
    logo?: string;
    score?: number;
    record?: string;
    /** `#rrggbb`, always. */
    color?: string;
}

export interface MatchPeriod {
    label: string;
    home?: number;
    away?: number;
}

export interface MatchEvent {
    /** As drawn: "23'", "90+2'". */
    minute?: string;
    team: MatchSide;
    type: MatchEventType;
    player?: string;
    detail?: string;
}

/** A match as the card draws it, once read. */
export interface Match {
    home: Team;
    away: Team;
    /** Absent when the tool said nothing, or something that is none of these (see `statusText`). */
    status?: MatchStatus;
    /** A status the card has no word for, as the tool wrote it: "Suspended", "Abandoned". */
    statusText?: string;
    clock?: string;
    period?: string;
    startTime?: Date;
    competition?: string;
    round?: string;
    /** A league's matchday, said in the chat's language ("Matchday 12", "12e journée"). */
    matchday?: number;
    venue?: string;
    sport: Sport;
    periods?: MatchPeriod[];
    events?: MatchEvent[];
    winner?: MatchSide;
    broadcast?: string;
    url?: string;
}

/** The card's data: one match or several, and the scoreboard's title. */
export interface ScoreData {
    title?: string;
    matches: Match[];
}

/** How an app plugs the score card in: the kit's options, and the clock "Today" is read against. */
export interface ScoreCardOptions extends CardSetupOptions<ScoreData, ScoreVariant> {
    /** The time "Today" and "Tomorrow" are worked out from (the device's clock by default). */
    now?: () => Date;
}

const S = {
    cardsScoreTitle: { en: 'Match', fr: 'Match', de: 'Spiel', es: 'Partido', it: 'Partita', ja: '試合', ko: '경기', pt: 'Partida', ru: 'Матч', zh: '比赛' },
    cardsScoreCount: { en: '{n} matches', fr: '{n} matchs', de: '{n} Spiele', es: '{n} partidos', it: '{n} partite', ja: '{n}試合', ko: '{n}경기', pt: '{n} partidas', ru: 'Матчей: {n}', zh: '{n} 场比赛' },
    cardsScoreVersus: { en: '{home} vs {away}', fr: '{home} – {away}', de: '{home} gegen {away}', es: '{home} vs. {away}', it: '{home} - {away}', ja: '{home} 対 {away}', ko: '{home} 대 {away}', pt: '{home} x {away}', ru: '{home} — {away}', zh: '{home} 对 {away}' },
    cardsScoreLive: { en: 'Live', fr: 'En direct', de: 'Live', es: 'En vivo', it: 'In diretta', ja: '試合中', ko: '진행 중', pt: 'Ao vivo', ru: 'Идёт', zh: '进行中' },
    cardsScoreHalfTime: { en: 'Half-time', fr: 'Mi-temps', de: 'Halbzeit', es: 'Descanso', it: 'Intervallo', ja: 'ハーフタイム', ko: '하프타임', pt: 'Intervalo', ru: 'Перерыв', zh: '中场休息' },
    cardsScoreFullTime: { en: 'Full time', fr: 'Terminé', de: 'Spielende', es: 'Final', it: 'Finale', ja: '試合終了', ko: '경기 종료', pt: 'Encerrado', ru: 'Матч завершён', zh: '完场' },
    cardsScoreFinal: { en: 'Final', fr: 'Terminé', de: 'Beendet', es: 'Final', it: 'Finale', ja: '試合終了', ko: '경기 종료', pt: 'Final', ru: 'Завершён', zh: '已结束' },
    cardsScoreEnded: { en: 'Finished', fr: 'Terminé', de: 'Beendet', es: 'Finalizado', it: 'Terminato', ja: '終了', ko: '종료', pt: 'Encerrado', ru: 'Завершён', zh: '已结束' },
    cardsScorePostponed: { en: 'Postponed', fr: 'Reporté', de: 'Verschoben', es: 'Aplazado', it: 'Rinviato', ja: '延期', ko: '연기', pt: 'Adiado', ru: 'Перенесён', zh: '延期' },
    cardsScoreCancelled: { en: 'Cancelled', fr: 'Annulé', de: 'Abgesagt', es: 'Cancelado', it: 'Annullato', ja: '中止', ko: '취소', pt: 'Cancelado', ru: 'Отменён', zh: '取消' },
    cardsScoreUpcoming: { en: 'Upcoming', fr: 'À venir', de: 'Demnächst', es: 'Próximamente', it: 'In programma', ja: '開始前', ko: '예정', pt: 'Em breve', ru: 'Скоро', zh: '未开始' },
    cardsScoreMatchday: { en: 'Matchday {n}', fr: '{n}e journée', de: '{n}. Spieltag', es: 'Jornada {n}', it: '{n}ª giornata', ja: '第{n}節', ko: '{n}라운드', pt: 'Rodada {n}', ru: '{n}-й тур', zh: '第{n}轮' },
    cardsScoreTeam: { en: 'Team', fr: 'Équipe', de: 'Team', es: 'Equipo', it: 'Squadra', ja: 'チーム', ko: '팀', pt: 'Time', ru: 'Команда', zh: '球队' },
    cardsScoreTotal: { en: 'Total', fr: 'Total', de: 'Gesamt', es: 'Total', it: 'Totale', ja: '計', ko: '합계', pt: 'Total', ru: 'Итог', zh: '总分' },
    cardsScoreSets: { en: 'Sets', fr: 'Sets', de: 'Sätze', es: 'Sets', it: 'Set', ja: 'セット', ko: '세트', pt: 'Sets', ru: 'Сеты', zh: '盘' },
    cardsScorePeriods: { en: 'Score by period', fr: 'Score par période', de: 'Ergebnis nach Abschnitten', es: 'Marcador por periodo', it: 'Punteggio per periodo', ja: 'ピリオド別スコア', ko: '구간별 점수', pt: 'Placar por período', ru: 'Счёт по периодам', zh: '分节比分' },
    cardsScoreEvents: { en: 'Match events', fr: 'Faits du match', de: 'Spielereignisse', es: 'Incidencias', it: 'Eventi della partita', ja: '試合経過', ko: '경기 기록', pt: 'Lances da partida', ru: 'События матча', zh: '比赛事件' },
    cardsScoreDetails: { en: 'Match details', fr: 'Détails du match', de: 'Spieldetails', es: 'Detalles del partido', it: 'Dettagli partita', ja: '試合の詳細', ko: '경기 상세', pt: 'Detalhes da partida', ru: 'Подробнее о матче', zh: '比赛详情' },
} satisfies Record<string, CardWord>;

const EVENT_WORDS: Record<MatchEventType, CardWord> = {
    goal: { en: 'Goal', fr: 'But', de: 'Tor', es: 'Gol', it: 'Gol', ja: 'ゴール', ko: '골', pt: 'Gol', ru: 'Гол', zh: '进球' },
    penalty: { en: 'Penalty', fr: 'Penalty', de: 'Elfmeter', es: 'Penalti', it: 'Rigore', ja: 'PK', ko: '페널티킥', pt: 'Pênalti', ru: 'Пенальти', zh: '点球' },
    'own-goal': { en: 'Own goal', fr: 'Contre son camp', de: 'Eigentor', es: 'En propia puerta', it: 'Autogol', ja: 'オウンゴール', ko: '자책골', pt: 'Gol contra', ru: 'Автогол', zh: '乌龙球' },
    yellow: { en: 'Yellow card', fr: 'Carton jaune', de: 'Gelbe Karte', es: 'Tarjeta amarilla', it: 'Cartellino giallo', ja: 'イエローカード', ko: '옐로카드', pt: 'Cartão amarelo', ru: 'Жёлтая карточка', zh: '黄牌' },
    red: { en: 'Red card', fr: 'Carton rouge', de: 'Rote Karte', es: 'Tarjeta roja', it: 'Cartellino rosso', ja: 'レッドカード', ko: '레드카드', pt: 'Cartão vermelho', ru: 'Красная карточка', zh: '红牌' },
    sub: { en: 'Substitution', fr: 'Remplacement', de: 'Auswechslung', es: 'Sustitución', it: 'Sostituzione', ja: '選手交代', ko: '선수 교체', pt: 'Substituição', ru: 'Замена', zh: '换人' },
};

/** The locale key an app sets to reword an event's kind. */
const EVENT_KEYS: Record<MatchEventType, string> = {
    goal: 'cardsScoreGoal', penalty: 'cardsScorePenalty', 'own-goal': 'cardsScoreOwnGoal',
    yellow: 'cardsScoreYellowCard', red: 'cardsScoreRedCard', sub: 'cardsScoreSubstitution',
};

type WordKey = keyof typeof S;

/** Twelve: a round of a league fits, a whole season does not. */
const MAX_MATCHES = 12;
/** Thirty events: every goal and card of a busy match; past that it is a commentary. */
const MAX_EVENTS = 30;
/** Periods kept: an extra-innings game, not a spreadsheet. */
const MAX_PERIODS = 12;
const MAX_BROADCASTS = 3;

// ── Reading ──────────────────────────────────────────────────────────────────

type Raw = Record<string, unknown>;

const isObject = (value: unknown): value is Raw => !!value && typeof value === 'object' && !Array.isArray(value);

/** The first of `keys` that `r` has a value for. */
function pick(r: Raw | undefined, keys: readonly string[]): unknown {
    if (!r) return undefined;
    for (const key of keys) if (r[key] !== undefined && r[key] !== null && r[key] !== '') return r[key];
    return undefined;
}

/** A name given as a string or as `{ name | displayName | fullName | title }`. */
function textOf(value: unknown): string | undefined {
    if (isObject(value)) return str(pick(value, ['name', 'displayName', 'fullName', 'title', 'shortName', 'abbreviation']));
    return str(value);
}

/** Lowercase, `_` and `-` as spaces: `IN_PLAY`, `in-play` and `In play` are one key. */
const keyOf = (value: string) => value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');

/**
 * Every spelling of a status the feeds use, by what it means. API-Football's short codes
 * (`NS`, `1H`, `HT`, `FT`, `AET`, `PEN`, `PST`, `CANC`), football-data.org's states
 * (`TIMED`, `IN_PLAY`, `PAUSED`, `FINISHED`), ESPN's `STATUS_*` names and `pre/in/post`
 * states. A suspension or an abandonment is none of them: it keeps the tool's own words.
 */
const STATUS_WORDS: Record<MatchStatus, readonly string[]> = {
    scheduled: ['scheduled', 'ns', 'tbd', 'timed', 'not started', 'pre', 'upcoming', 'fixture', 'status scheduled', 'pre match', 'prematch'],
    live: ['live', 'in play', 'inplay', 'in progress', 'playing', 'ongoing', 'started', '1h', '2h', 'et', 'bt', 'p', 'in', 'status in progress', 'status end period', 'status first half', 'status second half', 'first half', 'second half', 'extra time', 'penalty in progress', 'end of period'],
    halftime: ['halftime', 'half time', 'ht', 'paused', 'status halftime', 'interval'],
    final: ['final', 'ft', 'finished', 'full time', 'fulltime', 'ended', 'aet', 'pen', 'awarded', 'awd', 'wo', 'post', 'complete', 'completed', 'closed', 'match finished', 'after extra time', 'after penalties', 'status final', 'status full time', 'status final aet', 'status final pen', 'ft pen'],
    postponed: ['postponed', 'pst', 'status postponed'],
    cancelled: ['cancelled', 'canceled', 'canc', 'status canceled', 'status cancelled'],
};

const STATUS_BY_WORD = new Map<string, MatchStatus>(
    (Object.entries(STATUS_WORDS) as Array<[MatchStatus, readonly string[]]>).flatMap(([status, words]) => words.map((w) => [w, status] as const)),
);

/** A status from what a tool wrote, or `undefined` when the card has no word for it. */
function statusOf(value: unknown): MatchStatus | undefined {
    const text = str(value);
    return text ? STATUS_BY_WORD.get(keyOf(text)) : undefined;
}

const SPORT_WORDS: Array<[Sport, RegExp]> = [
    ['american-football', /^(american[\s_-]?football|nfl|ncaaf|gridiron|football \(american\))$/],
    ['football', /^(football|soccer|futbol|fútbol|calcio|fussball|fußball)$/],
    ['basketball', /^(basketball|basket|nba|wnba|ncaab|euroleague)$/],
    ['tennis', /^(tennis|atp|wta)$/],
    ['rugby', /^rugby/],
    ['hockey', /^((ice|field)[\s_-]?)?hockey$|^nhl$/],
    ['baseball', /^(baseball|mlb|softball)$/],
];

function sportOf(value: unknown): Sport | undefined {
    const text = textOf(value)?.toLowerCase();
    if (!text) return undefined;
    return SPORT_WORDS.find(([, re]) => re.test(text))?.[0];
}

/**
 * ESPN never names the sport: its uids start with the sport's number instead —
 * `s:600~l:700~e:401879254` is soccer, `s:40~l:46` basketball. Only the numbers seen in its
 * answers are listed; an unknown one says nothing.
 */
const ESPN_SPORTS: Record<string, Sport> = { 1: 'baseball', 20: 'american-football', 40: 'basketball', 70: 'hockey', 600: 'football', 850: 'tennis' };

function espnSport(uid: unknown): Sport | undefined {
    const id = typeof uid === 'string' ? /^s:(\d+)(?:~|$)/.exec(uid.trim())?.[1] : undefined;
    return id ? ESPN_SPORTS[id] : undefined;
}

/**
 * The sport a league says: its ESPN uid, then its sport, its abbreviation (`NBA`), its slug
 * (`atp`), its name. ESPN's soccer league says it in its uid alone — `English Premier
 * League`, `Premier League` and `eng.1` name no sport.
 */
function leagueSport(league: unknown): Sport | undefined {
    if (!isObject(league)) return sportOf(league);
    return espnSport(league['uid']) ?? [league['sport'], league['abbreviation'], league['slug'], league['name']].map(sportOf).find((s) => s !== undefined);
}

/** `#c8102e`, `c8102e` (ESPN writes it bare) or `#c12` → `#c8102e`; anything else is no colour. */
export function teamColor(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
    if (!match) return undefined;
    const hex = match[1]!.toLowerCase();
    return `#${hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex}`;
}

/** A score: a number, `"2"`, or `{ value }` / `{ displayValue }` as ESPN nests it. */
function scoreOf(value: unknown): number | undefined {
    if (isObject(value)) return num(pick(value, ['value', 'displayValue', 'score', 'total']));
    return num(value);
}

/** The match clock as drawn: a number of minutes is `67'`, with stoppage time `90+3'`. */
function minuteOf(value: unknown, extra?: unknown): string | undefined {
    if (isObject(value)) return minuteOf(pick(value, ['elapsed', 'minute', 'displayValue', 'value']), pick(value, ['extra', 'added', 'injuryTime']));
    const n = num(value);
    if (n !== undefined) {
        const plus = num(extra);
        return `${Math.round(n)}${plus ? `+${Math.round(plus)}` : ''}'`;
    }
    return str(value);
}

interface TeamRead extends Team {
    id?: string;
    won?: boolean;
    lines?: unknown[];
}

// `displayName` first: ESPN's `name` is the nickname ("Wizards"), its `displayName` the team ("Washington Wizards").
const NAME_KEYS = ['displayName', 'name', 'fullName', 'teamName', 'team_name', 'title', 'shortDisplayName'] as const;
const SHORT_KEYS = ['shortName', 'short_name', 'abbreviation', 'abbr', 'tla', 'code', 'shortDisplayName'] as const;
const LOGO_KEYS = ['logo', 'crest', 'logoUrl', 'logo_url', 'badge', 'emblem', 'image', 'imageUrl'] as const;
const SCORE_KEYS = ['score', 'goals', 'points', 'pts', 'runs'] as const;
const COLOR_KEYS = ['color', 'colour', 'primaryColor', 'primary_color', 'teamColor'] as const;

/** One team from a string, a team, or a competitor that wraps a `team` (ESPN). */
function readTeam(raw: unknown): TeamRead | null {
    if (typeof raw === 'string') {
        const name = str(raw);
        return name ? { name } : null;
    }
    if (!isObject(raw)) return null;
    const inner: Raw = isObject(raw['team']) ? raw['team'] : {};
    const both = (keys: readonly string[]) => pick(raw, keys) ?? pick(inner, keys);
    const name = str(pick(raw, NAME_KEYS)) ?? (typeof raw['team'] === 'string' ? str(raw['team']) : undefined) ?? str(pick(inner, NAME_KEYS));
    if (!name) return null;
    const shortName = str(both(SHORT_KEYS));
    const logos = both(['logos']);
    const logo = webUrl(textOrUrl(both(LOGO_KEYS))) ?? (Array.isArray(logos) ? webUrl(textOrUrl(logos[0])) : null);
    const score = scoreOf(pick(raw, SCORE_KEYS));
    const records = raw['records'];
    const record = str(pick(raw, ['record', 'recordSummary', 'standing'])) ?? (Array.isArray(records) ? str(isObject(records[0]) ? records[0]['summary'] : records[0]) : undefined);
    const color = teamColor(both(COLOR_KEYS));
    const id = str(both(['id', 'teamId', 'team_id', 'idTeam']));
    const won = typeof raw['winner'] === 'boolean' ? raw['winner'] : undefined;
    const lines = Array.isArray(raw['linescores']) ? raw['linescores'] : undefined;
    return {
        name,
        ...(shortName && shortName !== name ? { shortName } : {}),
        ...(logo ? { logo } : {}),
        ...(score !== undefined ? { score } : {}),
        ...(record ? { record } : {}),
        ...(color ? { color } : {}),
        ...(id ? { id } : {}),
        ...(won !== undefined ? { won } : {}),
        ...(lines ? { lines } : {}),
    };
}

/** A link given as a string or as `{ href | url | src }`. */
function textOrUrl(value: unknown): unknown {
    return isObject(value) ? pick(value, ['href', 'url', 'src']) : value;
}

/** Whether something looks like a match rather than an event of one: it has teams. */
function looksLikeMatch(value: unknown): boolean {
    if (!isObject(value)) return false;
    return ['home', 'homeTeam', 'home_team', 'teams', 'competitors', 'competitions', 'strHomeTeam', 'participants'].some((key) => value[key] !== undefined);
}

/** The two sides: `home`/`away` in any spelling, `teams.home`, or a `competitors` pair. */
function sidesOf(m: Raw): [unknown, unknown] {
    const home = pick(m, ['home', 'homeTeam', 'home_team', 'hometeam']);
    const away = pick(m, ['away', 'awayTeam', 'away_team', 'awayteam', 'visitor', 'visitors']);
    if (home !== undefined || away !== undefined) return [home, away];
    const teams = m['teams'];
    if (isObject(teams)) return [teams['home'], teams['away']];
    const list = [m['competitors'], m['participants'], teams].find(Array.isArray) as unknown[] | undefined;
    if (list) {
        const side = (wanted: MatchSide) => list.find((c) => isObject(c) && (c['homeAway'] === wanted || c['qualifier'] === wanted || c['side'] === wanted));
        return [side('home') ?? list[0], side('away') ?? list[1]];
    }
    if (m['strHomeTeam'] !== undefined) {
        // TheSportsDB: one flat record, `strHomeTeam`, `intHomeScore`, `strHomeTeamBadge`.
        return [
            { name: m['strHomeTeam'], score: m['intHomeScore'], logo: m['strHomeTeamBadge'] },
            { name: m['strAwayTeam'], score: m['intAwayScore'], logo: m['strAwayTeamBadge'] },
        ];
    }
    return [undefined, undefined];
}

/** A score the match gives beside its teams: `goals.home`, `score.fullTime.home`, `homeScore`, `"2-1"`. */
function matchScores(m: Raw): [number | undefined, number | undefined] {
    const pair = (value: unknown): [number | undefined, number | undefined] | undefined => {
        if (!isObject(value)) return undefined;
        const h = scoreOf(value['home']);
        const a = scoreOf(value['away']);
        return h !== undefined || a !== undefined ? [h, a] : undefined;
    };
    const score = m['score'];
    const text = typeof score === 'string' ? /^\s*(\d+)\s*[-–:]\s*(\d+)\s*$/.exec(score) : null;
    return pair(m['goals'])
        ?? pair(score)
        ?? pair(m['scores'])
        ?? (isObject(score) ? pair(score['fullTime']) ?? pair(score['fulltime']) ?? pair(score['current']) : undefined)
        ?? (text ? [Number(text[1]), Number(text[2])] : undefined)
        ?? [scoreOf(pick(m, ['homeScore', 'home_score', 'scoreHome'])), scoreOf(pick(m, ['awayScore', 'away_score', 'scoreAway']))];
}

/** The status, the clock and the period, from a string or a status object of any feed. */
function readState(m: Raw, fixture: Raw): Pick<Match, 'status' | 'statusText' | 'clock' | 'period'> & { periodNumber?: number } {
    const raw = pick(m, ['status', 'state', 'strStatus', 'matchStatus', 'match_status']) ?? fixture['status'];
    let status: MatchStatus | undefined;
    let text: string | undefined;
    // football-data.org puts the stoppage time beside the minute, on the match: `minute: 90, injuryTime: 7`.
    let clock = minuteOf(pick(m, ['clock', 'minute', 'elapsed', 'time_elapsed']), pick(m, ['injuryTime', 'injury_time']));
    let period: unknown = pick(m, ['period', 'currentPeriod']);
    if (isObject(raw)) {
        const type: Raw = isObject(raw['type']) ? raw['type'] : {};
        const said = [raw['short'], type['name'], type['state'], raw['long'], type['shortDetail'], type['description'], raw['name'], raw['state'], raw['description']];
        status = said.map(statusOf).find((s) => s !== undefined);
        text = str(raw['long'] ?? type['description'] ?? type['detail'] ?? raw['short'] ?? raw['description']);
        clock ??= minuteOf(pick(raw, ['elapsed', 'minute']), raw['extra']) ?? str(raw['displayClock'] ?? raw['clock']);
        period ??= pick(raw, ['period']);
    } else {
        status = statusOf(raw);
        text = str(raw);
    }
    const periodNumber = num(period);
    return {
        ...(status ? { status } : text ? { statusText: text } : {}),
        ...(clock ? { clock } : {}),
        ...(typeof period === 'string' && str(period) ? { period: str(period)! } : {}),
        ...(periodNumber !== undefined && typeof period !== 'string' ? { periodNumber } : {}),
    };
}

/**
 * "Q3" for a quarter, "P2" for a hockey period — what a clock needs beside it. A football
 * half or a tennis set given as a bare number says nothing a reader wants beside "67'".
 */
function periodName(sport: Sport, n: number): string | undefined {
    if (sport === 'basketball' || sport === 'american-football') return `Q${n}`;
    if (sport === 'hockey') return `P${n}`;
    return undefined;
}

function readPeriods(m: Raw, home: TeamRead, away: TeamRead): MatchPeriod[] | undefined {
    let periods: MatchPeriod[] = [];
    const list = [m['periods'], m['sets'], m['linescores'], m['innings']].find(Array.isArray) as unknown[] | undefined;
    if (list) {
        periods = list.map((p, i): MatchPeriod | null => {
            if (Array.isArray(p)) return { label: String(i + 1), ...side('home', num(p[0])), ...side('away', num(p[1])) };
            if (!isObject(p)) return null;
            const label = str(pick(p, ['label', 'name', 'period', 'set', 'number'])) ?? String(i + 1);
            return { label, ...side('home', scoreOf(pick(p, ['home', 'homeScore', 'home_score', 'h']))), ...side('away', scoreOf(pick(p, ['away', 'awayScore', 'away_score', 'a']))) };
        }).filter((p): p is MatchPeriod => p !== null);
    } else if (home.lines || away.lines) {
        // ESPN: each competitor carries its own `linescores`; zipped into one row per period.
        const count = Math.max(home.lines?.length ?? 0, away.lines?.length ?? 0);
        for (let i = 0; i < count; i++) {
            const at = (lines: unknown[] | undefined) => scoreOf(lines?.[i]);
            const p = home.lines?.[i] ?? away.lines?.[i];
            const label = (isObject(p) ? str(pick(p, ['label', 'period'])) : undefined) ?? String(i + 1);
            periods.push({ label, ...side('home', at(home.lines)), ...side('away', at(away.lines)) });
        }
    }
    periods = periods.filter((p) => p.home !== undefined || p.away !== undefined).slice(0, MAX_PERIODS);
    return periods.length ? periods : undefined;
}

const side = (key: MatchSide, value: number | undefined) => (value !== undefined ? { [key]: value } : {});

/** An event's kind from its type and detail, as any feed writes them; `null` for one the card does not draw. */
function eventType(type: unknown, detail: unknown, flags: Raw): MatchEventType | null {
    if (flags['ownGoal'] === true) return 'own-goal';
    if (flags['penaltyKick'] === true && flags['scoringPlay'] !== false) return 'penalty';
    if (flags['redCard'] === true) return 'red';
    if (flags['yellowCard'] === true) return 'yellow';
    // A VAR review is not an event of its own: what it confirmed ("Penalty confirmed") is
    // already in the list as the goal or the card, and what it cancelled never happened.
    const typed = typeof type === 'string' ? keyOf(type) : isObject(type) ? keyOf(String(type['text'] ?? type['type'] ?? '')) : '';
    if (/^var\b/.test(typed)) return null;
    for (const value of [detail, type]) {
        const t = typeof value === 'string' ? keyOf(value) : isObject(value) ? keyOf(String(value['text'] ?? value['type'] ?? '')) : '';
        if (!t) continue;
        if (/missed|saved|cancel|disallow/.test(t)) return null;
        if (/own goal|^og$|^own$/.test(t)) return 'own-goal';
        if (/penalty|^pen$|^pk$/.test(t) && !/card/.test(t)) return 'penalty';
        if (/red|second yellow|yellow red|yellowred/.test(t)) return 'red';
        if (/yellow/.test(t)) return 'yellow';
        if (/^sub|substitution|^subst|replacement/.test(t)) return 'sub';
        if (/goal|^regular$|^normal$|scor/.test(t)) return 'goal';
    }
    if (flags['scoringPlay'] === true) return 'goal';
    return null;
}

/** Which side an event belongs to: `home`/`away`, or a team named or numbered like one of the two. */
function eventSide(e: Raw, home: TeamRead, away: TeamRead): MatchSide | null {
    const said = pick(e, ['side', 'homeAway', 'team']);
    if (said === 'home' || said === 'away') return said;
    if (typeof e['isHome'] === 'boolean') return e['isHome'] ? 'home' : 'away';
    const team = pick(e, ['team', 'club']);
    const id = isObject(team) ? str(team['id']) : undefined;
    const name = textOf(team)?.toLowerCase();
    const matches = (t: TeamRead) => (id !== undefined && t.id === id) || (!!name && (t.name.toLowerCase() === name || t.shortName?.toLowerCase() === name));
    if (matches(home)) return 'home';
    if (matches(away)) return 'away';
    return null;
}

function readEvent(raw: unknown, home: TeamRead, away: TeamRead, implied?: MatchEventType): MatchEvent | null {
    if (!isObject(raw)) return null;
    const e = raw;
    const team = eventSide(e, home, away);
    if (!team) return null;
    // football-data.org's lists say what they hold: its bookings carry `card: 'YELLOW_RED'`,
    // its goals `type: 'OWN'`. Every other feed says the kind on the event itself.
    const kind = implied === 'sub' ? 'sub'
        : implied === 'yellow' ? eventType(e['card'] ?? e['type'], undefined, e) ?? 'yellow'
        : eventType(e['type'] ?? e['kind'] ?? e['card'], e['detail'], e) ?? (implied === 'goal' ? 'goal' : null);
    if (!kind) return null;
    const minute = minuteOf(pick(e, ['minute', 'time', 'clock', 'elapsed', 'min']), e['extra'] ?? e['injuryTime']);
    const athletes = e['athletesInvolved'];
    const player = textOf(pick(e, ['player', 'scorer', 'playerIn', 'athlete', 'playerName', 'player_name'])) ?? (Array.isArray(athletes) ? textOf(athletes[0]) : undefined);
    // What the type was read from is not repeated as the detail ("Normal Goal", "Yellow Card").
    const typed = typeof e['detail'] === 'string' && eventType(undefined, e['detail'], {}) !== null;
    const detail = (typed ? undefined : str(e['detail'])) ?? textOf(pick(e, ['assist', 'playerOut', 'note', 'description']));
    return {
        ...(minute ? { minute } : {}),
        team,
        type: kind,
        ...(player ? { player } : {}),
        ...(detail && detail !== player ? { detail } : {}),
    };
}

function readEvents(m: Raw, home: TeamRead, away: TeamRead): MatchEvent[] | undefined {
    const events: Array<MatchEvent | null> = [];
    const list = [m['events'], m['incidents'], m['timeline'], m['details'], m['keyEvents']].find(Array.isArray) as unknown[] | undefined;
    for (const e of list ?? []) events.push(readEvent(e, home, away));
    // football-data.org: the goals, the cards and the changes in three lists.
    if (!list) {
        const lists: Array<[unknown, MatchEventType]> = [[m['goals'], 'goal'], [m['bookings'], 'yellow'], [m['substitutions'], 'sub']];
        for (const [items, type] of lists) if (Array.isArray(items)) for (const e of items) events.push(readEvent(e, home, away, type));
    }
    const kept = events.filter((e): e is MatchEvent => e !== null);
    if (!list && kept.length) kept.sort((a, b) => minuteValue(a.minute) - minuteValue(b.minute));
    const shown = kept.slice(0, MAX_EVENTS);
    return shown.length ? shown : undefined;
}

/** `90+3'` → 90.03, for putting three lists back in order. */
function minuteValue(minute: string | undefined): number {
    const match = /(\d+)(?:\s*\+\s*(\d+))?/.exec(minute ?? '');
    return match ? Number(match[1]) + Number(match[2] ?? 0) / 100 : Infinity;
}

/** The round: a string, a matchday number, or API-Football's "Regular Season - 12". */
function readRound(m: Raw, league: Raw): Pick<Match, 'round' | 'matchday'> {
    const week = m['week'];
    const matchday = num(pick(m, ['matchday', 'matchDay', 'gameweek', 'intRound'])) ?? num(isObject(week) ? week['number'] : week);
    const round = str(pick(m, ['round', 'roundName'])) ?? str(league['round']);
    const regular = round ? /^regular season\s*[-–]\s*(\d+)$/i.exec(round) : null;
    if (regular) return { matchday: Number(regular[1]) };
    if (round) return { round };
    if (matchday !== undefined) return { matchday };
    const stage = str(m['stage']);
    // football-data.org says `REGULAR_SEASON` on every league match: that is no round.
    if (stage && !/^regular[_\s]season$/i.test(stage)) {
        const words = stage.replace(/_/g, ' ').toLowerCase();
        return { round: words.charAt(0).toUpperCase() + words.slice(1) };
    }
    return {};
}

function readBroadcast(m: Raw): string | undefined {
    const raw = pick(m, ['broadcast', 'broadcasts', 'tv', 'channel', 'channels', 'strTVStation', 'geoBroadcasts']);
    const names = (Array.isArray(raw) ? raw : [raw]).flatMap((b) => {
        if (isObject(b) && Array.isArray(b['names'])) return b['names'].map(str);
        if (isObject(b) && isObject(b['media'])) return [textOf(b['media'])];
        return [textOf(b)];
    }).filter((n): n is string => !!n);
    const unique = [...new Set(names)].slice(0, MAX_BROADCASTS);
    return unique.length ? unique.join(', ') : undefined;
}

function readVenue(value: unknown): string | undefined {
    if (!isObject(value)) return str(value);
    const name = textOf(value);
    const address = isObject(value['address']) ? value['address'] : {};
    const city = str(value['city'] ?? address['city']);
    return name && city && !name.includes(city) ? `${name}, ${city}` : name ?? city;
}

/** A date a feed gives without its zone, as TheSportsDB's `strTimestamp`, is UTC. */
const utc = (value: unknown) => (typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d)?$/.test(value.trim()) ? `${value.trim()}Z` : value);

/** `league`: the envelope's league (ESPN's `leagues[0]`), for the sport its events do not say. */
function readMatch(raw: unknown, league0?: unknown): Match | null {
    if (!isObject(raw)) return null;
    // ESPN puts the teams, the venue and the status in the event's first competition.
    const competitions = raw['competitions'];
    const m: Raw = Array.isArray(competitions) && isObject(competitions[0]) ? { ...raw, ...competitions[0], status: competitions[0]['status'] ?? raw['status'] } : raw;
    const fixture: Raw = isObject(m['fixture']) ? m['fixture'] : {};
    const league: Raw = isObject(m['league']) ? m['league'] : {};

    const [rawHome, rawAway] = sidesOf(m);
    const home = readTeam(rawHome);
    const away = readTeam(rawAway);
    if (!home || !away) return null;
    const [homeScore, awayScore] = matchScores(m);
    if (home.score === undefined && homeScore !== undefined) home.score = homeScore;
    if (away.score === undefined && awayScore !== undefined) away.score = awayScore;

    const sport = sportOf(pick(m, ['sport', 'strSport', 'sportName', 'discipline']) ?? league['sport'])
        ?? espnSport(raw['uid'] ?? m['uid'])
        ?? (league0 !== undefined ? leagueSport(league0) : undefined)
        // API-Football and football-data.org only ever carry football.
        ?? (m['fixture'] !== undefined || m['goals'] !== undefined || (isObject(m['score']) && isObject(m['score']['fullTime'])) ? 'football' : 'generic');
    const state = readState(m, fixture);
    const period = state.period ?? (state.periodNumber !== undefined ? periodName(sport, state.periodNumber) : undefined);
    const startTime = toDate(utc(pick(m, ['startTime', 'start_time', 'start', 'kickoff', 'kickOff', 'kick_off', 'utcDate', 'date', 'datetime', 'dateTime', 'startDate', 'commence_time', 'strTimestamp'])))
        ?? toDate(fixture['date'] ?? fixture['timestamp']);
    const competition = textOf(pick(m, ['competition', 'tournament', 'strLeague', 'leagueName']) ?? m['league']);
    const venue = readVenue(pick(m, ['venue', 'stadium', 'strVenue', 'arena']) ?? fixture['venue']);
    const periods = readPeriods(m, home, away);
    const events = readEvents(m, home, away);
    const links = m['links'];
    const url = webUrl(textOrUrl(pick(m, ['url', 'link', 'href', 'matchUrl', 'match_url']))) ?? (Array.isArray(links) ? webUrl(textOrUrl(links[0])) : null);
    const broadcast = readBroadcast(m);

    // Tennis gives the sets and not always the sets won: those are counted from the games —
    // the sets DECIDED only. A live 6–4, 3–2 is one set to none, not two: the set being played
    // is no one's yet (nor the one a retirement stopped in).
    for (const key of ['home', 'away'] as const) {
        const team = key === 'home' ? home : away;
        if (team.score !== undefined || !periods || state.status === 'scheduled') continue;
        const other: MatchSide = key === 'home' ? 'away' : 'home';
        const own = periods.map((p) => p[key]);
        if (own.some((v) => v === undefined)) continue;
        team.score = sport === 'tennis'
            ? periods.filter((p) => setWon(p[key] ?? 0, p[other] ?? 0)).length
            : own.reduce<number>((sum, v) => sum + (v ?? 0), 0);
    }

    const winner = readWinner(m, home, away, state.status);
    const strip = ({ id: _id, won: _won, lines: _lines, ...team }: TeamRead): Team => team;
    return {
        home: strip(home),
        away: strip(away),
        ...(state.status ? { status: state.status } : {}),
        ...(state.statusText ? { statusText: state.statusText } : {}),
        ...(state.clock ? { clock: state.clock } : {}),
        ...(period ? { period } : {}),
        ...(startTime ? { startTime } : {}),
        ...(competition ? { competition } : {}),
        ...readRound(m, league),
        ...(venue ? { venue } : {}),
        sport,
        ...(periods ? { periods } : {}),
        ...(events ? { events } : {}),
        ...(winner ? { winner } : {}),
        ...(broadcast ? { broadcast } : {}),
        ...(url ? { url } : {}),
    };
}

/**
 * A set won: six games and two clear (a 10–8 match tie-break too), or seven — a tie-break's
 * 7–6. Anything short of that is a set still being played.
 */
const setWon = (own: number, other: number) => own > other && own >= 6 && (own - other >= 2 || own === 7);

/** Who won: said by the tool in one of its ways, else the higher score of a finished match. */
function readWinner(m: Raw, home: TeamRead, away: TeamRead, status: MatchStatus | undefined): MatchSide | undefined {
    const score = isObject(m['score']) ? m['score'] : {};
    const said = str(m['winner'] ?? score['winner'])?.toLowerCase();
    if (said === 'home' || said === 'home_team') return 'home';
    if (said === 'away' || said === 'away_team') return 'away';
    if (said && said === home.name.toLowerCase()) return 'home';
    if (said && said === away.name.toLowerCase()) return 'away';
    if (home.won === true || (away.won === false && home.won === undefined)) return 'home';
    if (away.won === true) return 'away';
    if (said === 'draw' || status !== 'final' || home.score === undefined || away.score === undefined || home.score === away.score) return undefined;
    return home.score > away.score ? 'home' : 'away';
}

/**
 * The card's data from the loose shape `map` returns — one match, a list, or an envelope
 * (`matches`, `fixtures`, `games`, `events` of matches, API-Football's `response`) with its
 * `title` (or the competition's name) — or `null` when not one match has two named teams.
 * At most twelve are kept.
 */
export function readMatches(raw: unknown): ScoreData | null {
    let list: unknown[];
    let title: string | undefined;
    let league: unknown;
    if (Array.isArray(raw)) {
        list = raw;
    } else if (isObject(raw)) {
        const found = [raw['matches'], raw['fixtures'], raw['games'], raw['results'], raw['response'], raw['data'], raw['scores'], raw['events']]
            .find((v) => Array.isArray(v) && v.some(looksLikeMatch)) as unknown[] | undefined;
        if (found && !looksLikeMatch(raw)) {
            list = found;
            const leagues = raw['leagues'];
            league = Array.isArray(leagues) ? leagues[0] : raw['league'];
            title = str(raw['title'] ?? raw['heading'])
                ?? textOf(raw['competition'] ?? raw['league'])
                ?? (Array.isArray(leagues) ? textOf(leagues[0]) : undefined);
        } else {
            list = [raw];
        }
    } else {
        return null;
    }
    const matches = list.map((item) => readMatch(item, league)).filter((m): m is Match => m !== null).slice(0, MAX_MATCHES);
    if (!matches.length) return null;
    return { ...(title ? { title } : {}), matches };
}

// ── What a match says ────────────────────────────────────────────────────────

/** How the card shows a match: what it is, worked out once from its status, scores and time. */
type Phase = MatchStatus | 'other' | 'none';

function phaseOf(match: Match): Phase {
    if (match.status) return match.status;
    if (match.statusText) return 'other';
    if (hasScore(match)) return 'none';
    return match.startTime ? 'scheduled' : 'none';
}

const hasScore = (match: Match) => match.home.score !== undefined && match.away.score !== undefined;

/** Whether the board shows the score: a match under way or over, with both numbers. */
function showsScore(match: Match): boolean {
    const phase = phaseOf(match);
    return hasScore(match) && phase !== 'scheduled' && !((phase === 'postponed' || phase === 'cancelled') && match.home.score === 0 && match.away.score === 0);
}

/** "Full time" for football and rugby, "Final" for the American sports, "Finished" for the rest. */
function endWord(sport: Sport): WordKey {
    if (sport === 'football' || sport === 'rugby') return 'cardsScoreFullTime';
    if (sport === 'tennis' || sport === 'generic') return 'cardsScoreEnded';
    return 'cardsScoreFinal';
}

/** The live clock as one line: "Q3 4:12", "67'" — the period only when the clock does not say it. */
function clockText(match: Match): string | undefined {
    const parts = [match.period && !match.clock?.includes(match.period) ? match.period : undefined, match.clock].filter(Boolean);
    return parts.length ? parts.join(' ') : undefined;
}

/** The state of play in words — `undefined` for a scheduled match, which is said by its time. */
function statusText(config: AparteConfig, match: Match): string | undefined {
    const phase = phaseOf(match);
    switch (phase) {
        case 'live': {
            const clock = clockText(match);
            return `${word(config, 'cardsScoreLive', S.cardsScoreLive)}${clock ? ` ${clock}` : ''}`;
        }
        case 'halftime': return word(config, 'cardsScoreHalfTime', S.cardsScoreHalfTime);
        case 'final': return word(config, endWord(match.sport), S[endWord(match.sport)]);
        case 'postponed': return word(config, 'cardsScorePostponed', S.cardsScorePostponed);
        case 'cancelled': return word(config, 'cardsScoreCancelled', S.cardsScoreCancelled);
        case 'other': return match.statusText;
        default: return undefined;
    }
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/**
 * The day of a match as a person says it: "Yesterday", "Today", "Tomorrow", "Sat" within
 * the week, "Sat 14 Nov" further off — a bare weekday a fortnight away would be a lie.
 */
function dayText(config: AparteConfig, date: Date, now: Date): string {
    const days = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
    if (days === -1) {
        const tag = intlTag(config);
        const text = new Intl.RelativeTimeFormat(tag, { numeric: 'auto' }).format(-1, 'day');
        return text.charAt(0).toLocaleUpperCase(tag) + text.slice(1);
    }
    if (days >= 0 && days <= 6) return formatDay(config, date, 'short', now);
    return new Intl.DateTimeFormat(intlTag(config), { weekday: 'short', day: 'numeric', month: 'short' }).format(date);
}

/** Kick-off as one line: "Today 21:00", "Sat 9 PM". */
const whenText = (config: AparteConfig, date: Date, now: Date) => `${dayText(config, date, now)} ${formatHour(config, date)}`;

const versus = (config: AparteConfig, match: Match) => word(config, 'cardsScoreVersus', S.cardsScoreVersus, { home: match.home.name, away: match.away.name });

/**
 * Kick-off with nothing relative in it — `Mon, Nov 2, 2026, 9:00 PM GMT+1` — for the
 * fallback: it is stored in the history and read again days later, by a model or a person,
 * when "Today" has become a lie.
 */
const absoluteWhen = (config: AparteConfig, date: Date) => new Intl.DateTimeFormat(intlTag(config), {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
}).format(date);

/**
 * "Lille 2–1 Lens (Full time)", "Lille vs Lens — Sat 21:00", "Lille vs Lens (Postponed)".
 * `now` reads the day against the clock ("Today"); without it, the date is written out.
 */
function matchSentence(config: AparteConfig, match: Match, now?: Date): string {
    const said = statusText(config, match);
    if (showsScore(match)) {
        const score = `${match.home.name} ${formatNumber(config, match.home.score!)}–${formatNumber(config, match.away.score!)} ${match.away.name}`;
        return said ? `${score} (${said})` : score;
    }
    if (said) return `${versus(config, match)} (${said})`;
    if (!match.startTime) return versus(config, match);
    return `${versus(config, match)} — ${now ? whenText(config, match.startTime, now) : absoluteWhen(config, match.startTime)}`;
}

// ── Drawing ──────────────────────────────────────────────────────────────────

interface Settings {
    now: () => Date;
}

const notNull = <T>(value: T | null | undefined | false): value is T => value !== null && value !== undefined && value !== false;

/** The middle dot between two facts on a line — drawn, not read. */
const dot = () => el('span', { class: 'aparte-score__dot', attrs: { 'aria-hidden': 'true' }, text: '·' });

/**
 * A team's letters for its monogram: its short name when it is one (`PSG`), else the
 * initials of its name's words (`Paris Saint-Germain` → `PSG`, `Real Madrid` → `RM`), else
 * the first three letters of its one word (`Lille` → `LIL`), as broadcasters write them.
 * A club's `FC` or `AC` is not a word of its name. Two characters for Chinese, Japanese and
 * Korean names, which a disc fits.
 */
export function monogram(team: Pick<Team, 'name' | 'shortName'>): string {
    const short = team.shortName?.replace(/[^\p{L}\p{N}]/gu, '');
    if (short && [...short].length <= 3) return short.toLocaleUpperCase();
    const name = team.name;
    if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(name)) return [...name.replace(/\s+/g, '')].slice(0, 2).join('');
    const words = name.split(/[\s\-–.'’/&]+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
    const meaningful = words.filter((w) => !CLUB_PARTS.has(w.toLowerCase()));
    const kept = meaningful.length ? meaningful : words;
    if (!kept.length) return '?';
    const letters = kept.length === 1 ? [...kept[0]!].slice(0, 3).join('') : kept.slice(0, 3).map((w) => [...w][0]).join('');
    return letters.toLocaleUpperCase();
}

const CLUB_PARTS = new Set(['fc', 'cf', 'afc', 'ac', 'as', 'sc', 'sv', 'cd', 'rc', 'ssc', 'club', 'de', 'del', 'the', 'of', 'and', 'vfb', 'vfl', 'tsg', 'bk', 'if', 'fk', 'sk']);

/** Light or dark text on a team's colour: whichever reads better, by the colour's luminance. */
export function inkOn(hex: string): 'light' | 'dark' {
    const channel = (i: number) => {
        const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const luminance = 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
    // 0.179: where black and white text have the same contrast on the colour.
    return luminance > 0.179 ? 'dark' : 'light';
}

/** A team's colour on an element, as the custom property its sheet reads. */
function wear(node: HTMLElement, property: string, color: string | undefined): void {
    if (color) node.style.setProperty(property, color);
}

/**
 * The team's crest: its logo over its monogram, so a logo that fails to load leaves the
 * monogram — on a disc in the team's colour, or a neutral tint. Decorative (`alt=""`): the
 * team's name is always written beside it.
 */
function crestOf(team: Team, size: 'lg' | 'sm'): HTMLElement {
    const box = el('span', { class: `aparte-score__crest aparte-score__crest--${size}`, attrs: { 'aria-hidden': 'true', 'data-ink': team.color ? inkOn(team.color) : undefined } },
        el('span', { class: 'aparte-score__monogram', text: monogram(team) }));
    wear(box, '--aparte-score-team', team.color);
    if (team.logo) {
        const img = el('img', { class: 'aparte-score__logo', attrs: { src: team.logo, alt: '', loading: 'lazy', decoding: 'async' } });
        img.addEventListener('error', () => {
            img.remove();
            box.removeAttribute('data-logo');
        }, { once: true });
        box.setAttribute('data-logo', '');
        box.append(img);
    }
    return box;
}

/** `win` and `lose` once a winner is known; nothing for a draw or a match still to finish. */
const leadOf = (match: Match, key: MatchSide) => (match.winner ? (match.winner === key ? 'win' : 'lose') : undefined);

function numberOf(ctx: CardContext, value: number, className: string, attrs: Record<string, string | undefined> = {}): HTMLElement {
    const node = el('span', { class: className, attrs });
    ctx.bind(node, () => formatNumber(ctx.config, value));
    return node;
}

/** The status as a pill: a live one breathes, and every one says its state in a word. */
function pillOf(ctx: CardContext, match: Match): HTMLElement | null {
    const phase = phaseOf(match);
    if (phase === 'scheduled' || phase === 'none') return null;
    const pill = el('span', { class: 'aparte-score__pill', attrs: { 'data-phase': phase } });
    if (phase === 'live') {
        const said = el('span', { class: 'aparte-score__live-word' });
        ctx.word(said, 'cardsScoreLive', S.cardsScoreLive);
        const clock = clockText(match);
        pill.append(el('span', { class: 'aparte-score__live-dot', attrs: { 'aria-hidden': 'true' } }), said);
        if (clock) pill.append(el('span', { class: 'aparte-score__clock', text: clock }));
        return pill;
    }
    ctx.bind(pill, () => statusText(ctx.config, match)!);
    return pill;
}

/** Kick-off as a `<time>`: the day over the hour, or the two on one line. */
function kickoffOf(ctx: CardContext, date: Date, now: Date, className: string): HTMLElement {
    const node = el('time', { class: className, attrs: { datetime: date.toISOString() } });
    const day = el('span', { class: 'aparte-score__day' });
    const hour = el('span', { class: 'aparte-score__hour' });
    ctx.bind(day, () => dayText(ctx.config, date, now));
    ctx.bind(hour, () => formatHour(ctx.config, date));
    node.append(day, hour);
    return node;
}

/** The middle of the board: the score, else the kick-off, else a dash, with the status under it. */
function centreOf(ctx: CardContext, match: Match, now: Date): HTMLElement {
    const centre = el('div', { class: 'aparte-score__centre' });
    const phase = phaseOf(match);
    if (showsScore(match)) {
        const result = el('div', { class: 'aparte-score__result', attrs: { 'aria-hidden': 'true' } },
            numberOf(ctx, match.home.score!, 'aparte-score__num', { 'data-lead': leadOf(match, 'home') }),
            el('span', { class: 'aparte-score__sep', text: '–' }),
            numberOf(ctx, match.away.score!, 'aparte-score__num', { 'data-lead': leadOf(match, 'away') }));
        // The numbers are drawn for the eye between the two crests; a reader hears who has which.
        const said = el('span', { class: 'aparte-score__sr' });
        ctx.bind(said, () => `${match.home.name} ${formatNumber(ctx.config, match.home.score!)}, ${match.away.name} ${formatNumber(ctx.config, match.away.score!)}`);
        centre.append(result, said);
    } else if (match.startTime) {
        centre.append(kickoffOf(ctx, match.startTime, now, 'aparte-score__kickoff'));
    } else {
        centre.append(el('div', { class: 'aparte-score__result', attrs: { 'aria-hidden': 'true' } }, el('span', { class: 'aparte-score__sep', text: '–' })));
    }
    const pill = pillOf(ctx, match);
    if (pill) centre.append(pill);
    else if (phase === 'scheduled' && !match.startTime) {
        const upcoming = el('span', { class: 'aparte-score__pill', attrs: { 'data-phase': 'scheduled' } });
        ctx.word(upcoming, 'cardsScoreUpcoming', S.cardsScoreUpcoming);
        centre.append(upcoming);
    }
    return centre;
}

function teamOf(match: Match, key: MatchSide): HTMLElement {
    const team = match[key];
    return el('div', { class: `aparte-score__team aparte-score__team--${key}`, attrs: { 'data-lead': leadOf(match, key) } },
        crestOf(team, 'lg'),
        el('span', { class: 'aparte-score__team-name', text: team.name }),
        team.record ? el('span', { class: 'aparte-score__record', text: team.record }) : null);
}

/** The competition and the round over the board, and the day of a match that is not still to come. */
function headOf(ctx: CardContext, match: Match, now: Date): HTMLElement | null {
    const parts: HTMLElement[] = [];
    if (match.competition) parts.push(el('span', { class: 'aparte-score__competition', text: match.competition }));
    if (match.round) parts.push(el('span', { class: 'aparte-score__round', text: match.round }));
    else if (match.matchday !== undefined) {
        const day = match.matchday;
        const round = el('span', { class: 'aparte-score__round' });
        ctx.bind(round, () => word(ctx.config, 'cardsScoreMatchday', S.cardsScoreMatchday, { n: formatNumber(ctx.config, day) }));
        parts.push(round);
    }
    // A scheduled match says its day in the middle of the board; any other says it here.
    const date = match.startTime && showsScore(match) ? match.startTime : undefined;
    if (!parts.length && !date) return null;
    const line = el('div', { class: 'aparte-score__meta' });
    parts.forEach((part, i) => line.append(...(i ? [dot(), part] : [part])));
    let when: HTMLElement | null = null;
    if (date) {
        when = el('time', { class: 'aparte-score__date', attrs: { datetime: date.toISOString() } });
        ctx.bind(when, () => dayText(ctx.config, date, now));
    }
    return el('div', { class: 'aparte-score__head' },
        glyph(SPORT_GLYPHS[match.sport], 'aparte-rich-card__glyph aparte-score__sport'),
        line,
        when);
}

/** The venue, the broadcast, and the way to the match's page. */
function footOf(ctx: CardContext, match: Match): HTMLElement | null {
    const facts = [
        match.venue ? el('span', { class: 'aparte-score__fact aparte-score__venue' }, glyph(PIN, 'aparte-rich-card__glyph aparte-score__fact-glyph'), el('span', { text: match.venue })) : null,
        match.broadcast ? el('span', { class: 'aparte-score__fact aparte-score__broadcast' }, glyph(TV, 'aparte-rich-card__glyph aparte-score__fact-glyph'), el('span', { text: match.broadcast })) : null,
    ].filter(notNull);
    let link: HTMLElement | null = null;
    if (match.url) {
        const text = el('span');
        ctx.word(text, 'cardsScoreDetails', S.cardsScoreDetails);
        link = el('a', { class: 'aparte-score__more', attrs: { href: match.url, target: '_blank', rel: 'noopener noreferrer' } },
            text, glyph(CHEVRON, 'aparte-rich-card__glyph aparte-score__chevron'));
    }
    if (!facts.length && !link) return null;
    return el('div', { class: 'aparte-score__foot' }, facts.length ? el('div', { class: 'aparte-score__facts' }, ...facts) : null, link);
}

/** The board: the two teams facing each other, the score between them. */
function boardOf(ctx: CardContext, match: Match, now: Date): HTMLElement {
    return el('div', { class: 'aparte-score__board', attrs: { 'data-winner': match.winner } },
        teamOf(match, 'home'),
        centreOf(ctx, match, now),
        teamOf(match, 'away'));
}

/** The match's root, wearing both teams' colours for its band. */
function matchRoot(match: Match, className: string, tag: 'article' | 'li' | 'div' = 'article'): HTMLElement {
    const node = el(tag, { class: className, attrs: { 'data-phase': phaseOf(match), 'data-sport': match.sport } });
    wear(node, '--aparte-score-home', match.home.color);
    wear(node, '--aparte-score-away', match.away.color);
    return node;
}

/** The `card` variant: the scoreboard. */
function cardOf(ctx: CardContext, match: Match, now: Date): HTMLElement {
    const node = matchRoot(match, 'aparte-score aparte-score--card');
    node.append(...[headOf(ctx, match, now), boardOf(ctx, match, now), footOf(ctx, match)].filter(notNull));
    return node;
}

/** The score by period: periods as columns, the teams as rows, the total at the end. */
function periodsOf(ctx: CardContext, match: Match): HTMLElement | null {
    const periods = match.periods;
    if (!periods) return null;
    const tennis = match.sport === 'tennis';
    const caption = el('caption', { class: 'aparte-score__sr' });
    ctx.word(caption, 'cardsScorePeriods', S.cardsScorePeriods);
    const team = el('span', { class: 'aparte-score__sr' });
    ctx.word(team, 'cardsScoreTeam', S.cardsScoreTeam);
    const corner = el('th', { class: 'aparte-score__corner', attrs: { scope: 'col' } }, team);
    const total = el('th', { class: 'aparte-score__total', attrs: { scope: 'col' } });
    ctx.word(total, tennis ? 'cardsScoreSets' : 'cardsScoreTotal', tennis ? S.cardsScoreSets : S.cardsScoreTotal);
    const head = el('tr', {}, corner, ...periods.map((p) => el('th', { attrs: { scope: 'col' }, text: p.label })), total);
    const row = (key: MatchSide) => {
        const other: MatchSide = key === 'home' ? 'away' : 'home';
        const team = match[key];
        const cells = periods.map((p) => {
            const value = p[key];
            // A set is won game by game: the side that took it is marked, as a tennis table does.
            const took = tennis && value !== undefined && p[other] !== undefined && value > p[other]!;
            const cell = el('td', { attrs: { 'data-lead': took ? 'win' : undefined } });
            if (value !== undefined) ctx.bind(cell, () => formatNumber(ctx.config, value));
            return cell;
        });
        const sum = el('td', { class: 'aparte-score__total' });
        if (team.score !== undefined) ctx.bind(sum, () => formatNumber(ctx.config, team.score!));
        return el('tr', { attrs: { 'data-lead': leadOf(match, key) } },
            // The cell stays a cell; the crest and the name line up in a box inside it.
            el('th', { class: 'aparte-score__row-team', attrs: { scope: 'row' } },
                el('span', { class: 'aparte-score__row-label' }, crestOf(team, 'sm'), el('span', { class: 'aparte-score__row-name', text: team.shortName ?? team.name }))),
            ...cells, sum);
    };
    const table = el('table', { class: 'aparte-score__periods' }, caption, el('thead', {}, head), el('tbody', {}, row('home'), row('away')));
    return el('div', { class: 'aparte-score__section aparte-score__table-wrap' }, table);
}

/**
 * The match's events, in order, each on the side of its team: the home team's at the start,
 * the away team's at the end, the minute between. On a narrow card they fall into one
 * column, and the team is written beside each instead — the side never says it alone: a
 * reader hears the team's name either way.
 */
function eventsOf(ctx: CardContext, match: Match): HTMLElement | null {
    const events = match.events;
    if (!events) return null;
    const list = el('ol', { class: 'aparte-score__events' });
    ctx.bind(list, () => word(ctx.config, 'cardsScoreEvents', S.cardsScoreEvents), 'aria-label');
    for (const event of events) {
        const team = match[event.team];
        const type = el('span', { class: 'aparte-score__event-type' });
        ctx.word(type, EVENT_KEYS[event.type], EVENT_WORDS[event.type]);
        const marker = el('span', { class: 'aparte-score__event-team', attrs: { 'data-ink': team.color ? inkOn(team.color) : undefined }, text: team.shortName ?? team.name });
        wear(marker, '--aparte-score-team', team.color);
        const body = el('span', { class: 'aparte-score__event-body' },
            glyph(EVENT_GLYPHS[event.type], 'aparte-rich-card__glyph aparte-score__event-glyph'),
            el('span', { class: 'aparte-score__event-text' },
                event.player ? el('span', { class: 'aparte-score__player', text: event.player }) : null,
                type,
                event.detail ? el('span', { class: 'aparte-score__event-detail', text: event.detail }) : null),
            marker);
        list.append(el('li', { class: 'aparte-score__event', attrs: { 'data-team': event.team, 'data-type': event.type } },
            el('span', { class: 'aparte-score__minute', text: event.minute ?? '' }),
            body));
    }
    return el('div', { class: 'aparte-score__section aparte-score__timeline' }, list);
}

/** The `detail` variant: the board, then the score by period and the events. */
function detailOf(ctx: CardContext, match: Match, now: Date): HTMLElement {
    const node = matchRoot(match, 'aparte-score aparte-score--detail');
    node.append(...[headOf(ctx, match, now), boardOf(ctx, match, now), periodsOf(ctx, match), eventsOf(ctx, match), footOf(ctx, match)].filter(notNull));
    return node;
}

/** The status column of a row: the live clock, the state, or the kick-off. */
function whenOf(ctx: CardContext, match: Match, now: Date): HTMLElement {
    const box = el('div', { class: 'aparte-score__when' });
    const phase = phaseOf(match);
    if (phase === 'live') {
        const said = el('span', { class: 'aparte-score__live-word' });
        ctx.word(said, 'cardsScoreLive', S.cardsScoreLive);
        const clock = clockText(match);
        // With a clock the dot and the minute say it to the eye; the word stays for a reader.
        box.append(el('span', { class: 'aparte-score__live-dot', attrs: { 'aria-hidden': 'true' } }), clock ? el('span', { class: 'aparte-score__sr' }, said) : said);
        if (clock) box.append(el('span', { class: 'aparte-score__clock', text: clock }));
    } else if (phase === 'scheduled' || (phase === 'none' && !showsScore(match))) {
        if (match.startTime) box.append(kickoffOf(ctx, match.startTime, now, 'aparte-score__kickoff aparte-score__kickoff--row'));
        else ctx.word(box, 'cardsScoreUpcoming', S.cardsScoreUpcoming);
    } else {
        const said = statusText(ctx.config, match);
        if (said !== undefined) ctx.bind(box, () => statusText(ctx.config, match)!);
        else if (match.startTime) {
            const date = match.startTime;
            ctx.bind(box, () => dayText(ctx.config, date, now));
        }
    }
    box.setAttribute('data-phase', phase);
    return box;
}

/** One team's line in a row: crest, name, then its score at the end; the winner's in bold, with a mark. */
function lineOf(ctx: CardContext, match: Match, key: MatchSide, withScore: boolean): HTMLElement {
    const team = match[key];
    const lead = leadOf(match, key);
    return el('div', { class: 'aparte-score__line', attrs: { 'data-lead': lead } },
        crestOf(team, 'sm'),
        el('span', { class: 'aparte-score__line-name', text: team.name }),
        withScore && team.score !== undefined ? numberOf(ctx, team.score, 'aparte-score__line-score') : null,
        // The winner is not told by weight alone: a mark points at the score, as the scoreboards do.
        el('span', { class: 'aparte-score__win-mark', attrs: { 'aria-hidden': 'true' }, text: lead === 'win' ? '◂' : '' }));
}

/** The `compact` variant's row: the status column, then the two teams stacked. */
function rowOf(ctx: CardContext, match: Match, now: Date, tag: 'li' | 'div', withCompetition: boolean): HTMLElement {
    const node = matchRoot(match, 'aparte-score__row', tag);
    const scored = showsScore(match);
    const lines = el('div', { class: 'aparte-score__lines' },
        withCompetition && match.competition ? el('span', { class: 'aparte-score__row-meta', text: match.competition }) : null,
        lineOf(ctx, match, 'home', scored),
        lineOf(ctx, match, 'away', scored));
    node.append(whenOf(ctx, match, now), lines);
    if (match.url) {
        // The whole row is the link; its name is the match in one sentence.
        const link = el('a', { class: 'aparte-score__link', attrs: { href: match.url, target: '_blank', rel: 'noopener noreferrer' } });
        ctx.bind(link, () => matchSentence(ctx.config, match, now), 'aria-label');
        node.setAttribute('data-linked', '');
        node.append(link);
    }
    return node;
}

function countLabel(ctx: CardContext, data: Partial<ScoreData>): string {
    return data.title ?? commonCompetition(data.matches ?? []) ?? word(ctx.config, 'cardsScoreCount', S.cardsScoreCount, { n: formatNumber(ctx.config, data.matches?.length ?? 0) });
}

/** The competition every match shares, if they share one — the scoreboard's natural heading. */
function commonCompetition(matches: Match[]): string | undefined {
    const first = matches[0]?.competition;
    return first && matches.every((m) => m.competition === first) ? first : undefined;
}

/** A scoreboard's heading: its sport's glyph and its name. */
function headingOf(ctx: CardContext, data: ScoreData): HTMLElement {
    const text = el('span', { class: 'aparte-score__heading-text' });
    ctx.bind(text, () => countLabel(ctx, data));
    const sports = new Set(data.matches.map((m) => m.sport));
    const sport = sports.size === 1 ? [...sports][0]! : 'generic';
    return el('div', { class: 'aparte-score__heading' }, glyph(SPORT_GLYPHS[sport], 'aparte-rich-card__glyph aparte-score__sport'), text);
}

function render(data: ScoreData, ctx: CardContext<ScoreVariant>, settings: Settings): Node[] {
    const now = settings.now();
    const [first] = data.matches as [Match];
    if (data.matches.length > 1) {
        // Several matches are rows whatever the variant: see the module's comment.
        const shared = commonCompetition(data.matches) !== undefined || data.title !== undefined && data.matches.every((m) => !m.competition);
        const list = el('ul', { class: 'aparte-score__list', attrs: { role: 'list' } },
            ...data.matches.map((m) => rowOf(ctx, m, now, 'li', !shared)));
        ctx.bind(list, () => countLabel(ctx, data), 'aria-label');
        return [el('div', { class: 'aparte-score__board-list' }, headingOf(ctx, data), list)];
    }
    if (ctx.variant === 'compact') {
        const head = headOf(ctx, first, now);
        return [el('div', { class: 'aparte-score__single' }, head, rowOf(ctx, first, now, 'div', false))];
    }
    return [ctx.variant === 'detail' ? detailOf(ctx, first, now) : cardOf(ctx, first, now)];
}

function skeleton(partial: Partial<ScoreData> | null, ctx: CardContext<ScoreVariant>): Node[] {
    const block = (cls: string, kind: 'text' | 'rect' | 'circle' = 'rect') =>
        el('span', { class: `aparte-skeleton aparte-skeleton--${kind} ${cls}`, attrs: { 'aria-hidden': 'true' } });
    const known = partial?.matches?.[0];
    const name = (key: MatchSide, cls: string) => (known?.[key].name ? el('span', { class: cls, text: known[key].name }) : block(`${cls} aparte-score__sk-name`, 'text'));
    const head = partial?.title
        ? el('div', { class: 'aparte-score__heading' }, glyph(TROPHY, 'aparte-rich-card__glyph aparte-score__sport'), el('span', { class: 'aparte-score__heading-text', text: partial.title }))
        : el('div', { class: 'aparte-score__head' }, block('aparte-score__sk-meta', 'text'));
    if (ctx.variant === 'compact') {
        const line = (key: MatchSide) => el('div', { class: 'aparte-score__line' }, block('aparte-score__crest aparte-score__crest--sm', 'circle'), name(key, 'aparte-score__line-name'), block('aparte-score__sk-num'));
        return [el('div', { class: 'aparte-score__single' }, head,
            el('div', { class: 'aparte-score__row' }, el('div', { class: 'aparte-score__when' }, block('aparte-score__sk-when', 'text')),
                el('div', { class: 'aparte-score__lines' }, line('home'), line('away'))))];
    }
    const team = (key: MatchSide) => el('div', { class: `aparte-score__team aparte-score__team--${key}` },
        block('aparte-score__crest aparte-score__crest--lg', 'circle'), name(key, 'aparte-score__team-name'));
    const parts: HTMLElement[] = [head, el('div', { class: 'aparte-score__board' },
        team('home'),
        el('div', { class: 'aparte-score__centre' }, block('aparte-score__sk-score'), block('aparte-score__sk-pill')),
        team('away'))];
    if (ctx.variant === 'detail') {
        parts.push(el('div', { class: 'aparte-score__section aparte-score__sk-lines' }, ...[0, 1, 2, 3].map(() => block('aparte-score__sk-line', 'text'))));
    }
    return [el('article', { class: `aparte-score aparte-score--${ctx.variant}` }, ...parts)];
}

function label(data: Partial<ScoreData> | null, ctx: CardContext): string {
    const matches = data?.matches ?? [];
    if (matches.length === 1) {
        const [m] = matches as [Match];
        const names = [m.home.name, m.away.name].filter(Boolean);
        return names.length === 2 ? versus(ctx.config, m) : names[0] ?? word(ctx.config, 'cardsScoreTitle', S.cardsScoreTitle);
    }
    if (matches.length > 1 || data?.title) return countLabel(ctx, data!);
    return word(ctx.config, 'cardsScoreTitle', S.cardsScoreTitle);
}

function fallback(data: ScoreData, ctx: CardContext): string {
    const lines = data.matches.map((m) => matchSentence(ctx.config, m));
    return data.title ? `${data.title}:\n${lines.join('\n')}` : lines.join('\n');
}

/** What a running call's input already says: the two teams, one team, or what was searched. */
function partial(input: Record<string, unknown>): Partial<ScoreData> | null {
    const home = textOf(input['home'] ?? input['homeTeam'] ?? input['home_team'] ?? input['team'] ?? input['teamName'] ?? input['club']);
    const away = textOf(input['away'] ?? input['awayTeam'] ?? input['away_team'] ?? input['opponent']);
    if (home || away) return { matches: [{ home: { name: home ?? '' }, away: { name: away ?? '' }, sport: sportOf(input['sport']) ?? 'generic' }] };
    const query = str(input['query'] ?? input['q'] ?? input['search'] ?? input['competition'] ?? input['league']);
    return query ? { title: query } : null;
}

function createScoreCard(settings: Settings) {
    return defineCard<ScoreData, ScoreVariant>({
        name: 'score',
        variants: ['card', 'compact', 'detail'],
        styles: scoreStyles,
        icon: TROPHY,
        normalize: readMatches,
        render: (data, ctx) => render(data, ctx, settings),
        skeleton,
        label,
        fallback,
        partial,
    });
}

/**
 * The score card on the device's clock — for `scoreCard.segment(data)`. Plug it in with
 * `setupScoreCard`, which also hears the card's own option.
 */
export const scoreCard = createScoreCard({ now: () => new Date() });

/** Draw a tool's matches as this card — returns the function that stops it. */
export function setupScoreCard(options: ScoreCardOptions = {}): () => void {
    const { now, ...rest } = options;
    return createScoreCard({ now: now ?? (() => new Date()) }).setup(rest);
}
