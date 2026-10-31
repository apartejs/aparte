import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { aparteGlobalConfig, getSegmentRenderer, type AparteToolCallSegment } from '@aparte/core';
import { setupScoreCard, scoreCard, readMatches, monogram, inkOn, teamColor, type ScoreCardOptions, type Match } from './index.js';

// Monday 2 November 2026, noon — the week the other cards' tests pin too.
const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m);
const NOW = at(2, 12);

const LILLE = { name: 'Lille', shortName: 'LOSC', logo: 'https://example.com/lille.png', record: '8-2-1', color: '#c8102e', score: 2 };
const LENS = { name: 'Lens', color: 'ffd200', score: 1 };

const FINAL = {
    home: LILLE,
    away: LENS,
    status: 'final',
    sport: 'football',
    competition: 'Ligue 1',
    matchday: 12,
    venue: 'Stade Pierre-Mauroy',
    broadcast: ['Canal+', 'DAZN'],
    startTime: at(1, 21).toISOString(),
    url: 'https://example.com/match/1',
    periods: [{ label: '1st', home: 1, away: 0 }, { label: '2nd', home: 1, away: 1 }],
    events: [
        { minute: 23, team: 'home', type: 'goal', player: 'David', detail: 'Zhegrova' },
        { minute: "41'", team: 'away', type: 'yellow', player: 'Danso' },
        { minute: 58, team: 'away', type: 'penalty', player: 'Openda' },
        { minute: 77, team: 'home', type: 'own-goal', player: 'Medina' },
        { minute: 80, team: 'home', type: 'sub', player: 'Cabella', detail: 'Bouaddi' },
    ],
};

const LIVE = { home: 'Lyon', away: 'Marseille', status: 'live', clock: 67, sport: 'football', competition: 'Ligue 1', score: '1-0' };
const TONIGHT = { home: 'Nice', away: 'Monaco', status: 'scheduled', startTime: at(2, 21).toISOString(), competition: 'Ligue 1' };

let stop: () => void = () => {};
beforeEach(() => aparteGlobalConfig.extendLocale({ tag: 'en-US' }));
afterEach(() => {
    stop();
    stop = () => {};
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

function call(status: AparteToolCallSegment['status'], result?: unknown, input: Record<string, unknown> = { home: 'Lille', away: 'Lens' }): AparteToolCallSegment {
    return {
        id: 's1', type: 'tool_call', status,
        toolCall: { id: 'c1', name: 'get_match', input },
        ...(result !== undefined ? { structuredResult: result, result: JSON.stringify(result) } : {}),
    };
}

function setup(options: ScoreCardOptions = {}): void {
    stop = setupScoreCard({ tool: 'get_match', now: () => NOW, ...options });
}

function draw(segment: AparteToolCallSegment): HTMLElement {
    const out = aparteGlobalConfig.getToolRenderer('get_match')!.render(segment);
    expect(out).toBeInstanceOf(HTMLElement);
    document.body.append(out as HTMLElement);
    return out as HTMLElement;
}

const text = (root: Element, selector: string) => root.querySelector(selector)?.textContent ?? null;
const texts = (root: Element, selector: string) => [...root.querySelectorAll(selector)].map((n) => n.textContent);
const one = (raw: unknown): Match => readMatches(raw)!.matches[0]!;

describe('the score card on a tool', () => {
    beforeEach(() => setup());

    it('draws a finished match as a scoreboard: competition, the two teams, the score, the state, the footer', () => {
        const card = draw(call('resolved', FINAL));
        expect(card.dataset.card).toBe('score');
        expect(card.dataset.variant).toBe('card');
        expect(card.dataset.state).toBe('ready');
        expect(card.getAttribute('aria-label')).toBe('Lille vs Lens');
        const match = card.querySelector('.aparte-score--card')!;
        expect(match.getAttribute('data-phase')).toBe('final');
        expect(match.getAttribute('data-sport')).toBe('football');
        expect((match as HTMLElement).style.getPropertyValue('--aparte-score-home')).toBe('#c8102e');
        expect((match as HTMLElement).style.getPropertyValue('--aparte-score-away')).toBe('#ffd200');
        expect(text(card, '.aparte-score__competition')).toBe('Ligue 1');
        expect(text(card, '.aparte-score__round')).toBe('Matchday 12');
        expect(text(card, '.aparte-score__date')).toBe('Yesterday');
        expect(card.querySelector('.aparte-score__date')!.getAttribute('datetime')).toBe(at(1, 21).toISOString());
        expect(texts(card, '.aparte-score__team-name')).toEqual(['Lille', 'Lens']);
        expect(text(card, '.aparte-score__record')).toBe('8-2-1');
        expect(texts(card, '.aparte-score__num')).toEqual(['2', '1']);
        expect([...card.querySelectorAll('.aparte-score__num')].map((n) => n.getAttribute('data-lead'))).toEqual(['win', 'lose']);
        expect(card.querySelector('.aparte-score__board')!.getAttribute('data-winner')).toBe('home');
        expect(card.querySelector('.aparte-score__result')!.getAttribute('aria-hidden')).toBe('true');
        expect(text(card, '.aparte-score__centre .aparte-score__sr')).toBe('Lille 2, Lens 1');
        expect(text(card, '.aparte-score__pill')).toBe('Full time');
        expect(text(card, '.aparte-score__venue')).toBe('Stade Pierre-Mauroy');
        expect(text(card, '.aparte-score__broadcast')).toBe('Canal+, DAZN');
        const link = card.querySelector<HTMLAnchorElement>('a.aparte-score__more')!;
        expect(link.href).toBe('https://example.com/match/1');
        expect(link.target).toBe('_blank');
        expect(link.rel).toBe('noopener noreferrer');
        expect(link.textContent).toBe('Match details');
        // The card variant has no table and no timeline: those are the detail's.
        expect(card.querySelector('table, .aparte-score__events')).toBeNull();
        expect(card.textContent).not.toMatch(/NaN|undefined/);
    });

    it('shows a skeleton with the teams the input names while the call runs', () => {
        const card = draw(call('pending'));
        expect(card.dataset.state).toBe('loading');
        expect(card.getAttribute('aria-busy')).toBe('true');
        expect(card.getAttribute('aria-label')).toBe('Lille vs Lens — Loading');
        expect(texts(card, '.aparte-score__team-name')).toEqual(['Lille', 'Lens']);
        expect(card.querySelector('.aparte-score__sk-score')).not.toBeNull();
        expect(card.querySelectorAll('.aparte-score__crest.aparte-skeleton')).toHaveLength(2);

        const team = draw(call('pending', undefined, { team: 'Lille' }));
        expect(team.getAttribute('aria-label')).toBe('Lille — Loading');
        expect(team.querySelectorAll('.aparte-score__sk-name')).toHaveLength(1);

        const query = draw(call('pending', undefined, { query: 'Ligue 1 tonight' }));
        expect(query.getAttribute('aria-label')).toBe('Ligue 1 tonight — Loading');
        expect(text(query, '.aparte-score__heading-text')).toBe('Ligue 1 tonight');

        const bare = draw(call('pending', undefined, {}));
        expect(bare.getAttribute('aria-label')).toBe('Match — Loading');
        expect(bare.querySelectorAll('.aparte-score__sk-name')).toHaveLength(2);
    });

    it('shrinks to one line, never a card, when the call waited, was refused or failed', () => {
        expect(draw(call('awaiting-approval')).textContent).toContain('Waiting for your approval');
        expect(draw(call('rejected')).textContent).toContain('Not run');
        const failed = draw(call('failed'));
        expect(failed.dataset.state).toBe('unavailable');
        expect(failed.querySelector('.aparte-score')).toBeNull();
        expect(failed.textContent).toContain('Lille vs Lens');
    });

    it('says it is unavailable, and warns once, when the result has no match it can draw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const card = draw(call('resolved', { home: 'Lille' }));
        draw(call('resolved', []));
        draw(call('resolved', 'no match today'));
        expect(card.dataset.state).toBe('unavailable');
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

    it('patches the same element when the result lands', () => {
        const renderer = aparteGlobalConfig.getToolRenderer('get_match')!;
        const card = draw(call('pending'));
        renderer.update!(card, call('resolved', FINAL));
        expect(card.dataset.state).toBe('ready');
        expect(card.hasAttribute('aria-busy')).toBe(false);
        expect(card.getAttribute('aria-label')).toBe('Lille vs Lens');
        expect(texts(card, '.aparte-score__num')).toEqual(['2', '1']);
    });

    it('relabels words, numbers and days in place on a language switch, adding no node', () => {
        stop();
        setup({ variant: 'detail' });
        const renderer = aparteGlobalConfig.getToolRenderer('get_match')!;
        const card = draw(call('resolved', FINAL));
        const count = card.querySelectorAll('*').length;
        aparteGlobalConfig.extendLocale({ tag: 'fr-FR' });
        renderer.relabel!(card, call('resolved', FINAL));
        expect(card.querySelectorAll('*').length).toBe(count);
        expect(card.getAttribute('aria-label')).toBe('Lille – Lens');
        expect(text(card, '.aparte-score__pill')).toBe('Terminé');
        expect(text(card, '.aparte-score__round')).toBe('12e journée');
        expect(text(card, '.aparte-score__date')).toBe('Hier');
        expect(text(card, '.aparte-score__more')).toBe('Détails du match');
        expect(text(card, '.aparte-score__periods caption')).toBe('Score par période');
        expect(text(card, 'thead .aparte-score__total')).toBe('Total');
        expect(card.querySelector('.aparte-score__events')!.getAttribute('aria-label')).toBe('Faits du match');
        expect(texts(card, '.aparte-score__event-type')).toEqual(['But', 'Carton jaune', 'Penalty', 'Contre son camp', 'Remplacement']);
    });

    it("takes the app's own word over the package's", () => {
        aparteGlobalConfig.extendLocale({ tag: 'fr-FR', cardsScoreFullTime: 'Fin du match', cardsScoreGoal: 'Buuut' });
        stop();
        setup({ variant: 'detail' });
        const card = draw(call('resolved', FINAL));
        expect(text(card, '.aparte-score__pill')).toBe('Fin du match');
        expect(text(card, '.aparte-score__event-type')).toBe('Buuut');
    });

    it('never parses a value from the tool as markup', () => {
        stop();
        setup({ variant: 'detail' });
        const card = draw(call('resolved', {
            home: { name: '<img src=x onerror="window.__pwned=1">', record: '<b>r</b>', color: 'red;background:url(x)' },
            away: { name: '<script>alert(1)</script>', logo: 'javascript:alert(1)' },
            status: '<i>weird</i>',
            competition: '<u>c</u>',
            venue: '<svg onload=alert(1)>',
            url: 'javascript:alert(1)',
            periods: [{ label: '<em>1</em>', home: 1, away: 0 }],
            events: [{ team: 'home', type: 'goal', player: '<a href="javascript:alert(1)">p</a>' }],
        }));
        expect(card.querySelector('img, b, i, u, em, script, svg:not(.aparte-rich-card__glyph svg), a')).toBeNull();
        expect(text(card, '.aparte-score__team-name')).toContain('<img');
        expect(text(card, '.aparte-score__pill')).toBe('<i>weird</i>');
        expect(card.querySelector('.aparte-score__crest')!.hasAttribute('style')).toBe(false);
        expect(card.querySelector('.aparte-score__crest')!.hasAttribute('data-ink')).toBe(false);
        expect(card.querySelector('.aparte-score__logo')).toBeNull();
        expect(card.querySelector('.aparte-score__more')).toBeNull();
        expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    });

    it('draws no button for an action with an unsafe link', () => {
        stop();
        setup({ actions: () => [{ label: 'Open', url: 'javascript:alert(1)' }, { label: 'Highlights', url: 'https://example.com/h' }] });
        const card = draw(call('resolved', FINAL));
        expect(texts(card, '.aparte-rich-card__action')).toEqual(['Highlights']);
    });
});

describe('the state of play', () => {
    beforeEach(() => setup());

    it('pulses "Live" with the clock while the match is on', () => {
        const card = draw(call('resolved', LIVE));
        expect(card.querySelector('.aparte-score')!.getAttribute('data-phase')).toBe('live');
        const pill = card.querySelector('.aparte-score__pill')!;
        expect(pill.getAttribute('data-phase')).toBe('live');
        expect(pill.querySelector('.aparte-score__live-dot')!.getAttribute('aria-hidden')).toBe('true');
        expect(text(pill, '.aparte-score__live-word')).toBe('Live');
        expect(text(pill, '.aparte-score__clock')).toBe("67'");
        expect(texts(card, '.aparte-score__num')).toEqual(['1', '0']);
        // Nobody has won a match still being played.
        expect(card.querySelector('.aparte-score__num[data-lead]')).toBeNull();
        expect(scoreCard.segment(LIVE).fallback).toBe("Lyon 1–0 Marseille (Live 67')");
    });

    it('writes a quarter beside a basketball clock, and stoppage time after the minute', () => {
        const q = draw(call('resolved', { home: 'Celtics', away: 'Lakers', sport: 'nba', status: { type: { state: 'in' }, displayClock: '4:12', period: 3 }, homeScore: 80, awayScore: 77 }));
        expect(text(q, '.aparte-score__clock')).toBe('Q3 4:12');
        expect(one({ home: 'A', away: 'B', status: 'live', clock: 'Q2 1:00', period: 'Q2' }).period).toBe('Q2');
        expect(text(draw(call('resolved', { home: 'A', away: 'B', status: 'live', period: 'Q2', clock: 'Q2 1:00' })), '.aparte-score__clock')).toBe('Q2 1:00');
        expect(one({ fixture: { status: { short: '2H', elapsed: 90, extra: 3 } }, teams: { home: { name: 'A' }, away: { name: 'B' } }, goals: { home: 0, away: 0 } }).clock).toBe("90+3'");
        // A football half given as a number is no use beside the minute.
        expect(one({ home: 'A', away: 'B', sport: 'soccer', status: { type: { state: 'in' }, displayClock: "67'", period: 2 } }).period).toBeUndefined();
    });

    it('says "Half-time", and the end in the sport’s own words', () => {
        expect(text(draw(call('resolved', { ...LIVE, status: 'HT' })), '.aparte-score__pill')).toBe('Half-time');
        expect(text(draw(call('resolved', { home: 'A', away: 'B', score: '100-98', status: 'final', sport: 'basketball' })), '.aparte-score__pill')).toBe('Final');
        expect(text(draw(call('resolved', { home: 'A', away: 'B', score: '2-0', status: 'final', sport: 'tennis' })), '.aparte-score__pill')).toBe('Finished');
        expect(text(draw(call('resolved', { home: 'A', away: 'B', score: '2-0', status: 'FT' })), '.aparte-score__pill')).toBe('Finished');
        expect(text(draw(call('resolved', { home: 'A', away: 'B', score: '20-10', status: 'final', sport: 'rugby union' })), '.aparte-score__pill')).toBe('Full time');
    });

    it('shows the kick-off in place of a score before the match, by day and time', () => {
        const card = draw(call('resolved', TONIGHT));
        expect(card.querySelector('.aparte-score__result')).toBeNull();
        expect(card.querySelector('.aparte-score__pill')).toBeNull();
        const kickoff = card.querySelector('time.aparte-score__kickoff')!;
        expect(kickoff.getAttribute('datetime')).toBe(at(2, 21).toISOString());
        expect(text(kickoff, '.aparte-score__day')).toBe('Today');
        expect(text(kickoff, '.aparte-score__hour')).toBe('9 PM');
        // The day is in the middle; the line over the board does not repeat it.
        expect(card.querySelector('.aparte-score__date')).toBeNull();
        // `scoreCard.segment` reads the device's clock: pinned to the same Monday.
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(NOW);
        try {
            // The card says "Today"; the fallback, kept in the history, writes the date out.
            expect(scoreCard.segment(TONIGHT).fallback).toMatch(/^Nice vs Monaco — Mon, Nov 2, 2026, 9:00\sPM/);
        } finally {
            vi.useRealTimers();
        }
        expect(text(draw(call('resolved', { ...TONIGHT, startTime: at(7, 21).toISOString() })), '.aparte-score__day')).toBe('Sat');
        expect(text(draw(call('resolved', { ...TONIGHT, startTime: at(3, 18, 30).toISOString() })), '.aparte-score__day')).toBe('Tomorrow');
        expect(text(draw(call('resolved', { ...TONIGHT, startTime: at(14, 21).toISOString() })), '.aparte-score__day')).toBe('Sat, Nov 14');
    });

    it('says "Upcoming" for a match with no time yet, and a dash between the teams', () => {
        const card = draw(call('resolved', { home: 'A', away: 'B', status: 'NS' }));
        expect(text(card, '.aparte-score__sep')).toBe('–');
        expect(text(card, '.aparte-score__pill')).toBe('Upcoming');
    });

    it('marks a postponed or cancelled match, its kick-off struck through by the sheet', () => {
        const card = draw(call('resolved', { ...TONIGHT, status: 'PST' }));
        expect(card.querySelector('.aparte-score')!.getAttribute('data-phase')).toBe('postponed');
        expect(text(card, '.aparte-score__pill')).toBe('Postponed');
        expect(text(card, '.aparte-score__hour')).toBe('9 PM');
        expect(scoreCard.segment({ ...TONIGHT, status: 'CANC' }).fallback).toBe('Nice vs Monaco (Cancelled)');
    });

    it('keeps a status it has no word for as the tool wrote it', () => {
        const card = draw(call('resolved', { home: 'A', away: 'B', score: '1-1', fixture: { status: { short: 'SUSP', long: 'Match Suspended' } } }));
        expect(text(card, '.aparte-score__pill')).toBe('Match Suspended');
        expect(card.querySelector('.aparte-score')!.getAttribute('data-phase')).toBe('other');
    });

    it('draws a score with no status, and names no winner without one', () => {
        const card = draw(call('resolved', { home: 'A', away: 'B', score: '3-1', startTime: at(2, 15).toISOString() }));
        expect(texts(card, '.aparte-score__num')).toEqual(['3', '1']);
        expect(card.querySelector('.aparte-score__pill')).toBeNull();
        expect(card.querySelector('[data-lead]')).toBeNull();
        expect(text(card, '.aparte-score__date')).toBe('Today');
        expect(scoreCard.segment({ home: 'A', away: 'B', score: '3-1' }).fallback).toBe('A 3–1 B');
    });
});

describe('the crest', () => {
    beforeEach(() => setup());

    it('is the logo over a monogram, and the monogram when the logo fails', () => {
        const card = draw(call('resolved', FINAL));
        const [home, away] = [...card.querySelectorAll<HTMLElement>('.aparte-score__team .aparte-score__crest')];
        expect(home!.getAttribute('aria-hidden')).toBe('true');
        expect(home!.hasAttribute('data-logo')).toBe(true);
        const img = home!.querySelector('img')!;
        expect(img.getAttribute('src')).toBe('https://example.com/lille.png');
        expect(img.getAttribute('alt')).toBe('');
        expect(text(home!, '.aparte-score__monogram')).toBe('LIL');
        img.dispatchEvent(new Event('error'));
        expect(home!.querySelector('img')).toBeNull();
        expect(home!.hasAttribute('data-logo')).toBe(false);
        // No logo: the monogram on the team's colour, its text picked for contrast.
        expect(away!.querySelector('img')).toBeNull();
        expect(text(away!, '.aparte-score__monogram')).toBe('LEN');
        expect(away!.style.getPropertyValue('--aparte-score-team')).toBe('#ffd200');
        expect(away!.getAttribute('data-ink')).toBe('dark');
        expect(home!.getAttribute('data-ink')).toBe('light');
    });

    it('is a neutral disc for a team with no colour', () => {
        const card = draw(call('resolved', { home: 'Paris Saint-Germain', away: 'Real Madrid' }));
        const crests = [...card.querySelectorAll<HTMLElement>('.aparte-score__team .aparte-score__crest')];
        expect(crests.map((c) => c.textContent)).toEqual(['PSG', 'RM']);
        expect(crests.every((c) => !c.hasAttribute('data-ink') && !c.hasAttribute('style'))).toBe(true);
    });

    it('takes its letters from a short name, the initials, or the first three letters', () => {
        expect(monogram({ name: 'Olympique Lyonnais', shortName: 'OL' })).toBe('OL');
        expect(monogram({ name: 'Lille OSC', shortName: 'Lille' })).toBe('LO');
        expect(monogram({ name: 'Paris Saint-Germain' })).toBe('PSG');
        expect(monogram({ name: 'FC Barcelona' })).toBe('BAR');
        expect(monogram({ name: 'Manchester United FC' })).toBe('MU');
        expect(monogram({ name: 'Borussia Mönchengladbach Fohlen Elf' })).toBe('BMF');
        expect(monogram({ name: 'Lens' })).toBe('LEN');
        expect(monogram({ name: 'élan' })).toBe('ÉLA');
        expect(monogram({ name: '上海申花' })).toBe('上海');
        expect(monogram({ name: 'FC' })).toBe('FC');
        expect(monogram({ name: '!!!' })).toBe('?');
    });

    it('reads a colour strictly, and picks the text that reads on it', () => {
        expect(teamColor('#C8102E')).toBe('#c8102e');
        expect(teamColor('c8102e')).toBe('#c8102e');
        expect(teamColor('#c12')).toBe('#cc1122');
        for (const bad of ['red', '#c8102', 'rgb(1,2,3)', '#c8102e;x', 'url(x)', 12, null]) expect(teamColor(bad)).toBeUndefined();
        expect(inkOn('#ffffff')).toBe('dark');
        expect(inkOn('#000000')).toBe('light');
        expect(inkOn('#ffd200')).toBe('dark');
        expect(inkOn('#004170')).toBe('light');
    });
});

describe('the compact variant, and several matches', () => {
    it('draws one match as a row: the state, then the two teams stacked with their scores', () => {
        setup({ variant: 'compact' });
        const card = draw(call('resolved', FINAL));
        expect(card.querySelector('.aparte-score__board')).toBeNull();
        const row = card.querySelector('.aparte-score__single > div.aparte-score__row')!;
        expect(text(card, '.aparte-score__single .aparte-score__competition')).toBe('Ligue 1');
        expect(text(row, '.aparte-score__when')).toBe('Full time');
        expect(texts(row, '.aparte-score__line-name')).toEqual(['Lille', 'Lens']);
        expect(texts(row, '.aparte-score__line-score')).toEqual(['2', '1']);
        const lines = [...row.querySelectorAll('.aparte-score__line')];
        expect(lines.map((l) => l.getAttribute('data-lead'))).toEqual(['win', 'lose']);
        expect(texts(row, '.aparte-score__win-mark')).toEqual(['◂', '']);
        expect(row.querySelector('.aparte-score__win-mark')!.getAttribute('aria-hidden')).toBe('true');
        // The whole row is the link, named by the match in one sentence.
        const link = row.querySelector<HTMLAnchorElement>('a.aparte-score__link')!;
        expect(row.hasAttribute('data-linked')).toBe(true);
        expect(link.getAttribute('aria-label')).toBe('Lille 2–1 Lens (Full time)');
        expect(link.href).toBe('https://example.com/match/1');
    });

    it('draws several matches as a list of rows whatever the variant, headed by their competition', () => {
        for (const variant of ['card', 'compact', 'detail'] as const) {
            stop();
            setup({ variant });
            const card = draw(call('resolved', [FINAL, LIVE, TONIGHT]));
            expect(card.getAttribute('aria-label')).toBe('Ligue 1');
            expect(card.querySelector('.aparte-score__board')).toBeNull();
            const list = card.querySelector('ul.aparte-score__list')!;
            expect(list.getAttribute('aria-label')).toBe('Ligue 1');
            expect(list.querySelectorAll(':scope > li.aparte-score__row')).toHaveLength(3);
            expect(text(card, '.aparte-score__heading-text')).toBe('Ligue 1');
            expect(card.querySelector('.aparte-score__row-meta')).toBeNull();
        }
        const card = document.querySelector('.aparte-score__list')!;
        const [final, live, tonight] = [...card.querySelectorAll('.aparte-score__row')];
        expect(final!.getAttribute('data-phase')).toBe('final');
        expect(live!.querySelector('.aparte-score__when')!.getAttribute('data-phase')).toBe('live');
        expect(text(live!, '.aparte-score__clock')).toBe("67'");
        expect(text(live!, '.aparte-score__when .aparte-score__sr')).toBe('Live');
        expect(text(tonight!, '.aparte-score__day')).toBe('Today');
        expect(text(tonight!, '.aparte-score__hour')).toBe('9 PM');
        expect(tonight!.querySelector('.aparte-score__line-score')).toBeNull();
    });

    it('names a mixed scoreboard by its title or its count, and each row by its competition', () => {
        setup({ variant: 'compact' });
        const mixed = [FINAL, { ...LIVE, competition: 'Premier League' }];
        const card = draw(call('resolved', mixed));
        expect(card.getAttribute('aria-label')).toBe('2 matches');
        expect(texts(card, '.aparte-score__row-meta')).toEqual(['Ligue 1', 'Premier League']);
        const titled = draw(call('resolved', { title: 'Tonight', matches: mixed }));
        expect(titled.getAttribute('aria-label')).toBe('Tonight');
        expect(text(titled, '.aparte-score__heading-text')).toBe('Tonight');
    });

    it('says "Live" in the row when there is no clock, and the day of a finished match with no status', () => {
        setup({ variant: 'compact' });
        const live = draw(call('resolved', { home: 'A', away: 'B', status: 'IN_PLAY', score: '0-0' }));
        expect(text(live, '.aparte-score__when')).toBe('Live');
        expect(live.querySelector('.aparte-score__when .aparte-score__sr')).toBeNull();
        const past = draw(call('resolved', { home: 'A', away: 'B', score: '1-0', startTime: at(1, 15).toISOString() }));
        expect(text(past, '.aparte-score__when')).toBe('Yesterday');
        const upcoming = draw(call('resolved', { home: 'A', away: 'B', status: 'scheduled' }));
        expect(text(upcoming, '.aparte-score__when')).toBe('Upcoming');
        expect(upcoming.querySelector('.aparte-score__line-score')).toBeNull();
    });

    it('has a skeleton of a row', () => {
        setup({ variant: 'compact' });
        const card = draw(call('pending'));
        expect(texts(card, '.aparte-score__line-name')).toEqual(['Lille', 'Lens']);
        expect(card.querySelectorAll('.aparte-score__sk-num')).toHaveLength(2);
        expect(card.querySelector('.aparte-score__sk-when')).not.toBeNull();
    });

    it('keeps twelve matches at most', () => {
        setup({ variant: 'compact' });
        const many = Array.from({ length: 15 }, (_, i) => ({ home: `H${i}`, away: `A${i}`, score: '1-0' }));
        expect(draw(call('resolved', many)).querySelectorAll('.aparte-score__row')).toHaveLength(12);
    });
});

describe('the detail variant', () => {
    beforeEach(() => setup({ variant: 'detail' }));

    it('draws the board, then the score by period as a table', () => {
        const card = draw(call('resolved', FINAL));
        expect(card.querySelector('.aparte-score--detail .aparte-score__board')).not.toBeNull();
        const table = card.querySelector('table.aparte-score__periods')!;
        expect(text(table, 'caption')).toBe('Score by period');
        const head = [...table.querySelectorAll('thead th')];
        expect(head.map((th) => th.getAttribute('scope'))).toEqual(['col', 'col', 'col', 'col']);
        expect(head.map((th) => th.textContent)).toEqual(['Team', '1st', '2nd', 'Total']);
        const rows = [...table.querySelectorAll('tbody tr')];
        expect(rows.map((r) => r.getAttribute('data-lead'))).toEqual(['win', 'lose']);
        expect(rows[0]!.querySelector('th')!.getAttribute('scope')).toBe('row');
        expect(text(rows[0]!, '.aparte-score__row-name')).toBe('LOSC');
        expect(texts(rows[0]!, 'td')).toEqual(['1', '1', '2']);
        expect(texts(rows[1]!, 'td')).toEqual(['0', '1', '1']);
    });

    it('marks each set won, says "Sets", and counts the sets when the score is not given', () => {
        const card = draw(call('resolved', {
            home: 'Sinner', away: 'Alcaraz', sport: 'tennis', status: 'final',
            sets: [[6, 4], [3, 6], [7, 6]],
        }));
        expect(text(card, 'thead .aparte-score__total')).toBe('Sets');
        expect(texts(card, '.aparte-score__num')).toEqual(['2', '1']);
        const [home, away] = [...card.querySelectorAll('tbody tr')];
        expect([...home!.querySelectorAll('td')].map((td) => td.getAttribute('data-lead'))).toEqual(['win', null, 'win', null]);
        expect([...away!.querySelectorAll('td')].map((td) => td.getAttribute('data-lead'))).toEqual([null, 'win', null, null]);
        expect(home!.getAttribute('data-lead')).toBe('win');
    });

    it('draws the events in order, each on its team’s side, its kind said in a word', () => {
        const card = draw(call('resolved', FINAL));
        const list = card.querySelector('ol.aparte-score__events')!;
        expect(list.getAttribute('aria-label')).toBe('Match events');
        const items = [...list.querySelectorAll('li.aparte-score__event')];
        expect(items.map((li) => li.getAttribute('data-team'))).toEqual(['home', 'away', 'away', 'home', 'home']);
        expect(items.map((li) => li.getAttribute('data-type'))).toEqual(['goal', 'yellow', 'penalty', 'own-goal', 'sub']);
        expect(texts(list, '.aparte-score__minute')).toEqual(["23'", "41'", "58'", "77'", "80'"]);
        expect(texts(list, '.aparte-score__player')).toEqual(['David', 'Danso', 'Openda', 'Medina', 'Cabella']);
        expect(texts(list, '.aparte-score__event-type')).toEqual(['Goal', 'Yellow card', 'Penalty', 'Own goal', 'Substitution']);
        expect(texts(list, '.aparte-score__event-detail')).toEqual(['Zhegrova', 'Bouaddi']);
        // The team is written beside each event, for a reader and for a narrow card.
        expect(texts(list, '.aparte-score__event-team')).toEqual(['LOSC', 'Lens', 'Lens', 'LOSC', 'LOSC']);
        expect(items[0]!.querySelector('.aparte-score__event-glyph')!.getAttribute('aria-hidden')).toBe('true');
        expect((items[1]!.querySelector('.aparte-score__event-team') as HTMLElement).style.getPropertyValue('--aparte-score-team')).toBe('#ffd200');
    });

    it('draws no table and no timeline when the match has neither', () => {
        const card = draw(call('resolved', TONIGHT));
        expect(card.querySelector('table, .aparte-score__events, .aparte-score__foot')).toBeNull();
        expect(card.querySelector('.aparte-score--detail .aparte-score__board')).not.toBeNull();
    });

    it('keeps thirty events at most', () => {
        const events = Array.from({ length: 40 }, (_, i) => ({ minute: i, team: i % 2 ? 'away' : 'home', type: 'yellow' }));
        expect(draw(call('resolved', { ...FINAL, events })).querySelectorAll('.aparte-score__event')).toHaveLength(30);
    });

    it('has a skeleton of its shape', () => {
        const card = draw(call('pending'));
        expect(card.querySelector('.aparte-score--detail .aparte-score__sk-lines')).not.toBeNull();
    });
});

describe('choosing a variant', () => {
    it('picks one per result, and reads an unknown name as the default', () => {
        setup({ variant: (data) => (data.matches[0]!.events ? 'detail' : 'card') });
        expect(draw(call('resolved', FINAL)).dataset.variant).toBe('detail');
        expect(draw(call('resolved', LIVE)).dataset.variant).toBe('card');
        stop();
        setup({ variant: 'scoreboard' as never });
        expect(draw(call('resolved', LIVE)).dataset.variant).toBe('card');
    });
});

describe('the score card as a segment', () => {
    it('draws a card segment, and its fallback sentence says the same', () => {
        setup();
        const segment = scoreCard.segment(FINAL, { variant: 'compact' });
        expect(segment.fallback).toBe('Lille 2–1 Lens (Full time)');
        const out = getSegmentRenderer('card')!.render(segment as never) as HTMLElement;
        expect(out.dataset.card).toBe('score');
        expect(out.dataset.variant).toBe('compact');
        expect(text(out, '.aparte-score__line-name')).toBe('Lille');
        expect(scoreCard.segment({ title: 'Ligue 1', matches: [FINAL, { ...TONIGHT, startTime: at(14, 21).toISOString() }] }).fallback)
            .toMatch(/^Ligue 1:\nLille 2–1 Lens \(Full time\)\nNice vs Monaco — Sat, Nov 14, 2026, 9:00\sPM/);
        expect(scoreCard.segment({ home: 'A', away: 'B' }).fallback).toBe('A vs B');
        expect(scoreCard.segment({ nothing: true }).fallback).toBeUndefined();
    });

    it('draws a segment it cannot read as one line, and stops drawing once unplugged', () => {
        setup();
        const broken = getSegmentRenderer('card')!.render(scoreCard.segment({ home: 'A' }) as never) as HTMLElement;
        expect(broken.dataset.state).toBe('unavailable');
        stop();
        stop = () => {};
        const out = getSegmentRenderer('card');
        expect(out === undefined || out === null || (out.render(scoreCard.segment(FINAL) as never) as HTMLElement).dataset.card !== 'score').toBe(true);
    });
});

describe('reading the data', () => {
    it('reads one match, a list, an envelope, and the teams as names or objects', () => {
        expect(readMatches(FINAL)!.matches).toHaveLength(1);
        expect(readMatches([FINAL, LIVE])!.matches).toHaveLength(2);
        expect(readMatches({ title: 'Round 12', matches: [FINAL] })).toMatchObject({ title: 'Round 12' });
        expect(readMatches({ fixtures: [LIVE] })!.matches[0]!.home.name).toBe('Lyon');
        expect(readMatches({ games: [LIVE, { home: 'x' }] })!.matches).toHaveLength(1);
        expect(readMatches(null)).toBeNull();
        expect(readMatches(42)).toBeNull();
        expect(readMatches({ matches: [] })).toBeNull();
        const m = one(FINAL);
        expect(m.home).toEqual({ name: 'Lille', shortName: 'LOSC', logo: 'https://example.com/lille.png', score: 2, record: '8-2-1', color: '#c8102e' });
        expect(m.away).toEqual({ name: 'Lens', score: 1, color: '#ffd200' });
        expect(m.startTime).toEqual(at(1, 21));
        expect(m.winner).toBe('home');
        expect(m.broadcast).toBe('Canal+, DAZN');
    });

    it('reads API-Football', () => {
        const m = one({ response: [{
            fixture: { id: 1, date: '2026-11-01T20:00:00+00:00', venue: { name: 'Stade Pierre-Mauroy', city: "Villeneuve-d'Ascq" }, status: { long: 'Match Finished', short: 'FT', elapsed: 90 } },
            league: { name: 'Ligue 1', round: 'Regular Season - 12' },
            teams: { home: { id: 79, name: 'Lille', logo: 'https://media.example/79.png', winner: true }, away: { id: 116, name: 'Lens', logo: 'https://media.example/116.png', winner: false } },
            goals: { home: 2, away: 1 },
            score: { halftime: { home: 1, away: 0 }, fulltime: { home: 2, away: 1 } },
            events: [
                { time: { elapsed: 23, extra: null }, team: { id: 79, name: 'Lille' }, player: { name: 'J. David' }, assist: { name: 'E. Zhegrova' }, type: 'Goal', detail: 'Normal Goal' },
                { time: { elapsed: 45, extra: 2 }, team: { id: 116, name: 'Lens' }, player: { name: 'K. Danso' }, type: 'Card', detail: 'Yellow Card' },
                { time: { elapsed: 60 }, team: { id: 116 }, player: { name: 'L. Openda' }, type: 'Goal', detail: 'Missed Penalty' },
                { time: { elapsed: 62 }, team: { id: 116 }, player: { name: 'L. Openda' }, type: 'Goal', detail: 'Penalty' },
                { time: { elapsed: 70 }, team: { id: 999 }, player: { name: 'Nobody' }, type: 'Goal', detail: 'Normal Goal' },
                { time: { elapsed: 75 }, team: { id: 79 }, player: { name: 'R. Cabella' }, assist: { name: 'A. Bouaddi' }, type: 'subst', detail: 'Substitution 1' },
                { time: { elapsed: 80 }, team: { id: 79 }, player: { name: 'X' }, type: 'Var', detail: 'Goal cancelled' },
            ],
        }] });
        expect(m).toMatchObject({
            status: 'final', sport: 'football', competition: 'Ligue 1', matchday: 12,
            venue: "Stade Pierre-Mauroy, Villeneuve-d'Ascq", winner: 'home', clock: "90'",
            home: { name: 'Lille', logo: 'https://media.example/79.png', score: 2 },
            away: { name: 'Lens', score: 1 },
        });
        expect(m.startTime!.toISOString()).toBe('2026-11-01T20:00:00.000Z');
        expect(m.events).toEqual([
            { minute: "23'", team: 'home', type: 'goal', player: 'J. David', detail: 'E. Zhegrova' },
            { minute: "45+2'", team: 'away', type: 'yellow', player: 'K. Danso' },
            { minute: "62'", team: 'away', type: 'penalty', player: 'L. Openda' },
            { minute: "75'", team: 'home', type: 'sub', player: 'R. Cabella', detail: 'A. Bouaddi' },
        ]);
    });

    it('reads football-data.org, its three lists of events put back in order', () => {
        const data = readMatches({
            competition: { name: 'Premier League' },
            matches: [{
                utcDate: '2026-11-01T15:00:00Z', status: 'FINISHED', matchday: 10, stage: 'REGULAR_SEASON',
                homeTeam: { id: 57, name: 'Arsenal FC', shortName: 'Arsenal', tla: 'ARS', crest: 'https://crests.example/57.png' },
                awayTeam: { id: 61, name: 'Chelsea FC', shortName: 'Chelsea', tla: 'CHE' },
                score: { winner: 'DRAW', fullTime: { home: 1, away: 1 }, halfTime: { home: 0, away: 1 } },
                goals: [
                    { minute: 70, team: { id: 57, name: 'Arsenal FC' }, scorer: { name: 'Saka' }, type: 'PENALTY' },
                    { minute: 12, injuryTime: null, team: { id: 61 }, scorer: { name: 'Palmer' }, assist: { name: 'Jackson' }, type: 'REGULAR' },
                ],
                bookings: [{ minute: 55, team: { id: 61 }, player: { name: 'Caicedo' }, card: 'YELLOW_RED' }, { minute: 30, team: { id: 57 }, player: { name: 'Rice' }, card: 'YELLOW' }],
                substitutions: [{ minute: 60, team: { id: 57 }, playerOut: { name: 'Havertz' }, playerIn: { name: 'Jesus' } }],
            }, {
                utcDate: '2026-11-08T15:00:00Z', status: 'TIMED', stage: 'QUARTER_FINALS',
                homeTeam: { name: 'Arsenal FC' }, awayTeam: { name: 'Spurs' }, score: { fullTime: { home: null, away: null } },
            }],
        })!;
        expect(data.title).toBe('Premier League');
        const [m, next] = data.matches as [Match, Match];
        expect(m).toMatchObject({ status: 'final', sport: 'football', matchday: 10, home: { name: 'Arsenal FC', shortName: 'Arsenal', logo: 'https://crests.example/57.png', score: 1 }, away: { score: 1 } });
        expect(m.winner).toBeUndefined();
        expect(m.events!.map((e) => [e.minute, e.team, e.type, e.player, e.detail])).toEqual([
            ["12'", 'away', 'goal', 'Palmer', 'Jackson'],
            ["30'", 'home', 'yellow', 'Rice', undefined],
            ["55'", 'away', 'red', 'Caicedo', undefined],
            ["60'", 'home', 'sub', 'Jesus', 'Havertz'],
            ["70'", 'home', 'penalty', 'Saka', undefined],
        ]);
        expect(next).toMatchObject({ status: 'scheduled', round: 'Quarter finals' });
        expect(next.home.score).toBeUndefined();
    });

    it('reads an ESPN scoreboard: competitions, competitors, line scores, the clock, the broadcasts', () => {
        const data = readMatches({
            leagues: [{ name: 'NBA' }],
            events: [{
                name: 'Lakers at Celtics', date: '2026-11-02T00:30Z',
                links: [{ href: 'https://espn.example/game/1' }],
                competitions: [{
                    venue: { fullName: 'TD Garden', address: { city: 'Boston' } },
                    broadcasts: [{ names: ['ESPN', 'ESPN'] }, { names: ['NBA TV'] }],
                    status: { displayClock: '0.0', period: 4, type: { name: 'STATUS_FINAL', state: 'post', shortDetail: 'Final' } },
                    competitors: [
                        { id: '13', homeAway: 'away', winner: false, score: '98', team: { id: '13', displayName: 'Los Angeles Lakers', abbreviation: 'LAL', color: '552583', logo: 'https://espn.example/lal.png' }, records: [{ summary: '5-3' }], linescores: [{ value: 20 }, { value: 30 }, { value: 25 }, { value: 23 }] },
                        { id: '2', homeAway: 'home', winner: true, score: '104', team: { id: '2', displayName: 'Boston Celtics', abbreviation: 'BOS', color: '#007a33' }, records: [{ summary: '6-2' }], linescores: [{ value: 28 }, { value: 22 }, { value: 30 }, { value: 24 }] },
                    ],
                    details: [{ clock: { displayValue: '1:00' }, team: { id: '2' }, type: { text: 'Technical Foul' } }],
                }],
            }],
        })!;
        expect(data.title).toBe('NBA');
        const m = data.matches[0]!;
        expect(m).toMatchObject({
            status: 'final', sport: 'basketball', venue: 'TD Garden, Boston', broadcast: 'ESPN, NBA TV', url: 'https://espn.example/game/1', winner: 'home',
            home: { name: 'Boston Celtics', shortName: 'BOS', score: 104, record: '6-2', color: '#007a33' },
            away: { name: 'Los Angeles Lakers', shortName: 'LAL', score: 98, record: '5-3', color: '#552583', logo: 'https://espn.example/lal.png' },
        });
        expect(m.periods).toEqual([
            { label: '1', home: 28, away: 20 }, { label: '2', home: 22, away: 30 }, { label: '3', home: 30, away: 25 }, { label: '4', home: 24, away: 23 },
        ]);
        expect(m.events).toBeUndefined();
    });

    it('reads ESPN soccer details: goals, cards, penalties, own goals', () => {
        const m = one({
            sport: 'soccer',
            competitors: [{ homeAway: 'home', team: { id: '1', name: 'Lille' }, score: { value: 2 } }, { homeAway: 'away', team: { id: '2', name: 'Lens' }, score: '1' }],
            status: { type: { name: 'STATUS_FULL_TIME' } },
            details: [
                { clock: { displayValue: "12'" }, team: { id: '1' }, type: { text: 'Goal' }, scoringPlay: true, athletesInvolved: [{ displayName: 'David' }] },
                { clock: { displayValue: "30'" }, team: { id: '2' }, type: { text: 'Yellow Card' }, yellowCard: true, athletesInvolved: [{ displayName: 'Danso' }] },
                { clock: { displayValue: "50'" }, team: { id: '2' }, type: { text: 'Penalty - Scored' }, scoringPlay: true, penaltyKick: true },
                { clock: { displayValue: "60'" }, team: { id: '1' }, type: { text: 'Own Goal' }, ownGoal: true, scoringPlay: true },
                { clock: { displayValue: "88'" }, team: { id: '1' }, type: { text: 'Red Card' }, redCard: true },
                { clock: { displayValue: "90'" }, team: { id: '1' }, type: { text: 'Scoring' }, scoringPlay: true },
            ],
        });
        expect(m.sport).toBe('football');
        expect(m.status).toBe('final');
        expect(m.events!.map((e) => `${e.minute} ${e.team} ${e.type}`)).toEqual(["12' home goal", "30' away yellow", "50' away penalty", "60' home own-goal", "88' home red", "90' home goal"]);
    });

    it('reads TheSportsDB, its timestamp in UTC', () => {
        const m = one({ events: [{ strHomeTeam: 'Lille', strAwayTeam: 'Lens', intHomeScore: '2', intAwayScore: '1', strLeague: 'French Ligue 1', strVenue: 'Stade Pierre-Mauroy', strTimestamp: '2026-11-01T20:00:00', strStatus: 'Match Finished', strSport: 'Soccer', intRound: '12', strHomeTeamBadge: 'https://tsdb.example/lille.png' }] });
        expect(m).toMatchObject({ home: { name: 'Lille', score: 2, logo: 'https://tsdb.example/lille.png' }, away: { name: 'Lens', score: 1 }, status: 'final', competition: 'French Ligue 1', venue: 'Stade Pierre-Mauroy', sport: 'football', matchday: 12, winner: 'home' });
        expect(m.startTime!.toISOString()).toBe('2026-11-01T20:00:00.000Z');
    });

    it('reads the usual hand-written spellings', () => {
        expect(one({ home_team: { team_name: 'A', primary_color: '#123456' }, away_team: 'B', home_score: 3, away_score: '1', status: 'Full-Time', league: 'L', round: 'Final', winner: 'B' })).toMatchObject({
            home: { name: 'A', score: 3, color: '#123456' }, away: { name: 'B', score: 1 }, status: 'final', competition: 'L', round: 'Final', winner: 'away',
        });
        expect(one({ teams: [{ name: 'X', points: 5 }, { name: 'Y', points: 7 }], state: 'post' })).toMatchObject({ home: { name: 'X', score: 5 }, away: { name: 'Y', score: 7 }, winner: 'away' });
        expect(one({ home: 'A', away: 'B', scores: { home: 1, away: 1 }, status: 'final' }).winner).toBeUndefined();
        expect(one({ home: 'A', away: 'B', score: '2:2', winner: 'draw', status: 'final' }).winner).toBeUndefined();
        expect(one({ home: 'A', away: 'B', winner: 'a' }).winner).toBe('home');
        expect(one({ home: 'A', away: 'B', status: 'final', score: { home: 0, away: 3 } }).winner).toBe('away');
        expect(one({ home: 'A', away: 'B', competitors: [] }).home.name).toBe('A');
        // Periods from pairs, from labelled objects, summed into a score the tool left out.
        expect(one({ home: 'A', away: 'B', status: 'final', sport: 'hockey', periods: [{ period: 'P1', h: 1, a: 0 }, { name: 'P2', homeScore: 2, awayScore: 2 }, 'junk'] })).toMatchObject({
            periods: [{ label: 'P1', home: 1, away: 0 }, { label: 'P2', home: 2, away: 2 }], home: { score: 3 }, away: { score: 2 }, winner: 'home',
        });
        expect(one({ home: 'A', away: 'B', periods: [{ label: '1' }] }).periods).toBeUndefined();
        expect(one({ home: 'A', away: 'B', periods: Array.from({ length: 20 }, () => [1, 0]) }).periods).toHaveLength(12);
        // Events: by side, by `isHome`, by team name; one with no team is dropped.
        expect(one({ home: 'A', away: { name: 'Bee', shortName: 'BEE' }, events: [
            { side: 'home', type: 'goal', min: '5' },
            { isHome: false, type: 'red' },
            { team: 'bee', type: 'Substitution', player: 'P', detail: 'P' },
            { type: 'goal' },
            'junk',
            { team: 'home', type: 'corner' },
        ] }).events).toEqual([
            { minute: "5'", team: 'home', type: 'goal' },
            { team: 'away', type: 'red' },
            { team: 'away', type: 'sub', player: 'P' },
        ]);
        // A broadcast given as text, as a list of names or of channels.
        expect(one({ home: 'A', away: 'B', tv: 'BBC' }).broadcast).toBe('BBC');
        expect(one({ home: 'A', away: 'B', broadcasts: [{ media: { shortName: 'ESPN' } }, 'ESPN', 'Sky', 'beIN', 'DAZN'] }).broadcast).toBe('ESPN, Sky, beIN');
        // A link only over http(s); a venue as text; a sport by its league's name.
        expect(one({ home: 'A', away: 'B', link: { href: 'https://x.example/m' } }).url).toBe('https://x.example/m');
        expect(one({ home: 'A', away: 'B', url: 'mailto:a@b.c' }).url).toBeUndefined();
        expect(one({ home: 'A', away: 'B', stadium: 'Anfield' }).venue).toBe('Anfield');
        expect(one({ home: 'A', away: 'B', sport: { name: 'NFL' } }).sport).toBe('american-football');
        expect(one({ home: 'A', away: 'B', sport: 'curling' }).sport).toBe('generic');
        expect(one({ home: 'A', away: 'B', sport: 'MLB' }).sport).toBe('baseball');
        expect(one({ home: 'A', away: 'B', week: { number: 9 } }).matchday).toBe(9);
        expect(one({ home: 'A', away: 'B', startTime: 'not a date' }).startTime).toBeUndefined();
    });
});

describe('labels', () => {
    it('names the card by its teams, its title, its competition or its count', () => {
        setup();
        expect(draw(call('resolved', LIVE)).getAttribute('aria-label')).toBe('Lyon vs Marseille');
        expect(draw(call('resolved', { title: 'Derby day', matches: [LIVE] })).getAttribute('aria-label')).toBe('Lyon vs Marseille');
        expect(draw(call('resolved', [LIVE, { home: 'C', away: 'D' }])).getAttribute('aria-label')).toBe('2 matches');
        aparteGlobalConfig.extendLocale({ tag: 'ja-JP' });
        expect(draw(call('resolved', [LIVE, { home: 'C', away: 'D' }])).getAttribute('aria-label')).toBe('2試合');
        expect(draw(call('resolved', LIVE)).getAttribute('aria-label')).toBe('Lyon 対 Marseille');
    });
});

describe('what the audit found', () => {
    it('counts only the sets decided: the set being played is no one’s yet', () => {
        expect(one({ home: 'Sinner', away: 'Alcaraz', sport: 'tennis', status: 'live', sets: [[6, 4], [3, 2]] })).toMatchObject({ home: { score: 1 }, away: { score: 0 } });
        // A retirement: the set it stopped in was not won either.
        expect(one({ home: 'Sinner', away: 'Alcaraz', sport: 'tennis', status: 'final', sets: [[6, 4], [2, 1]] })).toMatchObject({ home: { score: 1 }, away: { score: 0 } });
        // A tie-break set, and a match tie-break.
        expect(one({ home: 'A', away: 'B', sport: 'tennis', status: 'final', sets: [[7, 6], [4, 6], [10, 8]] })).toMatchObject({ home: { score: 2 }, away: { score: 1 } });
        // Line scores as ESPN's live tennis writes them (2026-10-31): 6–4, then 1–0 in the second.
        const espn = one({ sport: 'tennis', status: { type: { name: 'STATUS_IN_PROGRESS', state: 'in' } }, competitors: [
            { homeAway: 'home', team: { displayName: 'A' }, linescores: [{ value: 6, winner: true }, { value: 1 }] },
            { homeAway: 'away', team: { displayName: 'B' }, linescores: [{ value: 4, winner: false }, { value: 0 }] },
        ] });
        expect([espn.home.score, espn.away.score]).toEqual([1, 0]);
    });

    // From ESPN's site API scoreboards (2026-10-25 and 2026-10-30), one event each, trimmed.
    const ESPN_SOCCER = {
        leagues: [{ id: '700', uid: 's:600~l:700', name: 'English Premier League', abbreviation: 'Premier League', slug: 'eng.1' }],
        events: [{
            id: '401879254', date: '2026-10-25T14:00Z', name: 'Newcastle United at Crystal Palace',
            competitions: [{
                competitors: [
                    { homeAway: 'home', score: '0', winner: false, team: { id: '384', name: 'Crystal Palace', displayName: 'Crystal Palace', shortDisplayName: 'C Palace', abbreviation: 'CRY', color: '0202fb' } },
                    { homeAway: 'away', score: '2', winner: true, team: { id: '361', name: 'Newcastle United', displayName: 'Newcastle United', shortDisplayName: 'Newcastle', abbreviation: 'NEW', color: '000000' } },
                ],
                status: { clock: 5400, displayClock: "90'+9'", period: 2, type: { id: '28', name: 'STATUS_FULL_TIME', state: 'post', completed: true, description: 'Full Time', detail: 'FT', shortDetail: 'FT' } },
            }],
        }],
    };
    const ESPN_NBA = {
        leagues: [{ id: '46', uid: 's:40~l:46', name: 'National Basketball Association', abbreviation: 'NBA', slug: 'nba' }],
        events: [{
            id: '401909277', uid: 's:40~l:46~e:401909277', date: '2026-10-30T23:00Z', name: 'Charlotte Hornets at Washington Wizards',
            competitions: [{
                competitors: [
                    { homeAway: 'home', score: '95', winner: true, team: { id: '27', name: 'Wizards', displayName: 'Washington Wizards', shortDisplayName: 'Wizards', abbreviation: 'WSH', location: 'Washington', color: 'e31837' } },
                    { homeAway: 'away', score: '79', winner: false, team: { id: '30', name: 'Hornets', displayName: 'Charlotte Hornets', shortDisplayName: 'Hornets', abbreviation: 'CHA', location: 'Charlotte', color: '008ca8' } },
                ],
                status: { clock: 720, displayClock: '12:00', period: 4, type: { id: '3', name: 'STATUS_FINAL', state: 'post', completed: true, description: 'Final', detail: 'Final', shortDetail: 'Final' } },
            }],
        }],
    };

    it("reads the sport of an ESPN scoreboard from its league, and a team by its full name", () => {
        const soccer = one(ESPN_SOCCER);
        expect(soccer.sport).toBe('football');
        expect(soccer).toMatchObject({ status: 'final', home: { name: 'Crystal Palace', score: 0 }, away: { name: 'Newcastle United', score: 2 } });
        const nba = one(ESPN_NBA);
        expect(nba.sport).toBe('basketball');
        expect(nba).toMatchObject({ home: { name: 'Washington Wizards', shortName: 'WSH' }, away: { name: 'Charlotte Hornets' } });
        // An event mapped out of its envelope still says its sport, in its own uid.
        expect(one(ESPN_NBA.events[0]).sport).toBe('basketball');
    });

    it('writes an absolute date and time in its fallback: the history keeps it past today', () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(NOW);
        try {
            const said = scoreCard.segment(TONIGHT).fallback!;
            expect(said).not.toMatch(/Today|Tomorrow/);
            expect(said).toMatch(/^Nice vs Monaco — Mon, Nov 2, 2026, 9:00\sPM/);
        } finally {
            vi.useRealTimers();
        }
    });

    it("draws no event for a VAR review, whatever it confirmed", () => {
        const m = one({ response: [{
            fixture: { id: 1, status: { short: '2H', elapsed: 70 } },
            teams: { home: { id: 79, name: 'Lille' }, away: { id: 116, name: 'Lens' } },
            goals: { home: 1, away: 0 },
            events: [
                { time: { elapsed: 66 }, team: { id: 79 }, player: { name: 'J. David' }, type: 'Goal', detail: 'Penalty' },
                { time: { elapsed: 65 }, team: { id: 79 }, player: { name: 'J. David' }, type: 'Var', detail: 'Penalty confirmed' },
                { time: { elapsed: 50 }, team: { id: 116 }, player: { name: 'X' }, type: 'Var', detail: 'Card upgrade' },
            ],
        }] });
        expect(m.events).toEqual([{ minute: "66'", team: 'home', type: 'penalty', player: 'J. David' }]);
    });

    it("shows football-data.org's stoppage time on a live clock", () => {
        const m = one({ matches: [{
            utcDate: '2026-11-01T15:00:00Z', status: 'IN_PLAY', minute: 90, injuryTime: 7,
            homeTeam: { id: 57, name: 'Arsenal FC' }, awayTeam: { id: 61, name: 'Chelsea FC' },
            score: { fullTime: { home: 1, away: 1 } },
        }] });
        expect(m).toMatchObject({ status: 'live', clock: "90+7'" });
    });
});
