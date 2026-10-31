import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { aparteGlobalConfig, getSegmentRenderer, type AparteToolCallSegment } from '@aparte/core';
import { setupStatsCard, statsCard, readStats, humanizeKey, statValue, statChange, type Stat } from './index.js';

const REVENUE = { label: 'Revenue', value: 12000, currency: 'USD', change: 0.12, changeLabel: 'vs last week', good: 'up', trend: [8, 9, 11, 10, 12], icon: 'money' };
const ORDERS = { label: 'Orders', value: 340, change: -0.05, good: 'up' };
const CHURN = { label: 'Churn', value: 0.021, format: 'percent', change: -0.4, good: 'down', hint: 'Monthly' };
const RESPONSE = { label: 'Response time', value: 4800, format: 'duration' };
const WEEK = { title: 'Sales this week', subtitle: 'Mon–Sun', items: [REVENUE, ORDERS, CHURN, RESPONSE], footnote: 'Source: Stripe', updatedAt: '2026-10-30T14:05:00Z' };

let stop: () => void = () => {};
beforeEach(() => aparteGlobalConfig.extendLocale({ tag: 'en-US' }));
afterEach(() => {
    stop();
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

function call(status: AparteToolCallSegment['status'], result?: unknown, input: Record<string, unknown> = { metric: 'sales' }): AparteToolCallSegment {
    return {
        id: 's1', type: 'tool_call', status,
        toolCall: { id: 'c1', name: 'get_kpis', input },
        ...(result !== undefined ? { structuredResult: result, result: JSON.stringify(result) } : {}),
    };
}

function draw(segment: AparteToolCallSegment): HTMLElement {
    const renderer = aparteGlobalConfig.getToolRenderer('get_kpis')!;
    const out = renderer.render(segment);
    expect(out).toBeInstanceOf(HTMLElement);
    document.body.append(out as HTMLElement);
    return out as HTMLElement;
}

const text = (root: Element, selector: string) => root.querySelector(selector)?.textContent ?? null;
const texts = (root: Element, selector: string) => [...root.querySelectorAll(selector)].map((n) => n.textContent);
const stat = (raw: unknown): Stat => readStats(raw)!.items[0]!;
const config = aparteGlobalConfig;

describe('the stats card on a tool', () => {
    beforeEach(() => {
        stop = setupStatsCard({ tool: 'get_kpis' });
    });

    it('draws the figures as tiles, under their heading and over their footer', () => {
        const card = draw(call('resolved', WEEK));
        expect(card.dataset.card).toBe('stats');
        expect(card.dataset.variant).toBe('tiles');
        expect(card.dataset.state).toBe('ready');
        expect(card.getAttribute('aria-label')).toBe('Sales this week');
        expect(text(card, '.aparte-stats__title')).toBe('Sales this week');
        expect(text(card, '.aparte-stats__subtitle')).toBe('Mon–Sun');
        expect(texts(card, '.aparte-stats__label-text')).toEqual(['Revenue', 'Orders', 'Churn', 'Response time']);
        expect(texts(card, '.aparte-stats__value')).toEqual(['$12,000', '340', '2.1%', '1 hr 20 min']);
        expect(text(card, '.aparte-stats__footnote')).toBe('Source: Stripe');
        const updated = card.querySelector('time.aparte-stats__updated')!;
        expect(updated.getAttribute('datetime')).toBe('2026-10-30T14:05:00.000Z');
        expect(updated.textContent).toMatch(/^Updated \w{3} \d{1,2}:\d{2}/);
        expect(card.textContent).not.toMatch(/NaN|undefined/);
    });

    it('shows a skeleton of tiles, with what the figures are about, while the call runs', () => {
        const card = draw(call('pending'));
        expect(card.dataset.state).toBe('loading');
        expect(card.getAttribute('aria-busy')).toBe('true');
        expect(card.getAttribute('aria-label')).toBe('sales — Loading');
        expect(text(card, '.aparte-stats__title')).toBe('sales');
        expect(card.querySelectorAll('.aparte-stats__tiles .aparte-stats__tile .aparte-stats__sk-big')).toHaveLength(4);
        const bare = draw(call('pending', undefined, {}));
        expect(bare.getAttribute('aria-label')).toBe('Key figures — Loading');
        expect(bare.querySelector('.aparte-stats__head .aparte-stats__sk-title')).not.toBeNull();
    });

    it('shrinks to one line, never a card, when the call waited, was refused or failed', () => {
        expect(draw(call('awaiting-approval')).textContent).toContain('Waiting for your approval');
        expect(draw(call('rejected')).textContent).toContain('Not run');
        const failed = draw(call('failed'));
        expect(failed.dataset.state).toBe('unavailable');
        expect(failed.querySelector('.aparte-stats__stat')).toBeNull();
        expect(failed.textContent).toContain('sales');
    });

    it('says it is unavailable, and warns once, when the result has no figure it can draw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const card = draw(call('resolved', { items: [{ label: 'No value' }, { value: 3 }] }));
        draw(call('resolved', []));
        expect(card.dataset.state).toBe('unavailable');
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

    it('patches the same element when the result lands', () => {
        const renderer = aparteGlobalConfig.getToolRenderer('get_kpis')!;
        const card = draw(call('pending'));
        renderer.update!(card, call('resolved', REVENUE));
        expect(card.dataset.state).toBe('ready');
        expect(card.hasAttribute('aria-busy')).toBe(false);
        expect(card.getAttribute('aria-label')).toBe('Revenue');
        expect(text(card, '.aparte-stats__value')).toBe('$12,000');
    });

    it('relabels numbers, durations, changes and words in place on a language switch, adding no node', () => {
        const renderer = aparteGlobalConfig.getToolRenderer('get_kpis')!;
        const data = { ...WEEK, title: undefined };
        const card = draw(call('resolved', data));
        const count = card.querySelectorAll('*').length;
        expect(card.getAttribute('aria-label')).toBe('4 figures');
        aparteGlobalConfig.extendLocale({ tag: 'fr-FR' });
        renderer.relabel!(card, call('resolved', data));
        expect(card.querySelectorAll('*').length).toBe(count);
        expect(card.getAttribute('aria-label')).toBe('4 chiffres');
        const values = texts(card, '.aparte-stats__value');
        expect(values[0]).toMatch(/^12\s000\s\$US$/u);
        expect(values[2]).toMatch(/^2,1\s%$/u);
        expect(values[3]).toMatch(/^1\sh 20\smin$/u);
        expect(texts(card, '.aparte-stats__delta')).toEqual([
            expect.stringMatching(/^\+12\s%$/u),
            expect.stringMatching(/^−5\s%$/u),
            expect.stringMatching(/^−40\s%$/u),
        ]);
        expect(text(card, '.aparte-stats__updated')).toMatch(/^Mis à jour /);
    });

    it("takes the app's own word over the package's", () => {
        aparteGlobalConfig.extendLocale({ tag: 'fr-FR', cardsStatsCount: '{n} KPI' });
        expect(draw(call('resolved', [REVENUE, ORDERS])).getAttribute('aria-label')).toBe('2 KPI');
    });

    it('never parses a value from the tool as markup', () => {
        const card = draw(call('resolved', {
            title: '<img src=x onerror="window.__pwned=1">',
            items: [{ label: '<b>x</b>', value: '<script>alert(1)</script>', hint: '<i>h</i>', changeLabel: '<u>u</u>', change: 0.1, icon: '<svg onload=alert(1)>' }],
            footnote: '<a href="javascript:alert(1)">src</a>',
        }));
        expect(card.querySelector('img, b, i, u, script, a')).toBeNull();
        expect(card.querySelector('.aparte-stats__icon')).toBeNull();
        expect(text(card, '.aparte-stats__title')).toContain('<img');
        expect(text(card, '.aparte-stats__value')).toBe('<script>alert(1)</script>');
        expect(card.querySelector('button')).toBeNull();
        expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    });

    it('draws no button for an action with an unsafe link', () => {
        stop();
        stop = setupStatsCard({ tool: 'get_kpis', actions: () => [{ label: 'Open', url: 'javascript:alert(1)' }, { label: 'Dashboard', url: 'https://example.com/d' }] });
        const card = draw(call('resolved', REVENUE));
        expect(texts(card, '.aparte-rich-card__action')).toEqual(['Dashboard']);
    });
});

describe('the change', () => {
    beforeEach(() => {
        stop = setupStatsCard({ tool: 'get_kpis' });
    });

    it('is a pill with an arrow and a signed number, coloured by which way is good', () => {
        const card = draw(call('resolved', WEEK));
        const [revenue, orders, churn, response] = [...card.querySelectorAll('.aparte-stats__tile')];
        const up = revenue!.querySelector('.aparte-stats__change')!;
        expect(up.getAttribute('data-direction')).toBe('up');
        expect(up.getAttribute('data-tone')).toBe('good');
        expect(text(up, '.aparte-stats__arrow')).toBe('▲');
        expect(up.querySelector('.aparte-stats__arrow')!.getAttribute('aria-hidden')).toBe('true');
        expect(text(up, '.aparte-stats__delta')).toBe('+12%');
        expect(text(up, '.aparte-stats__change-label')).toBe('vs last week');
        expect(revenue!.getAttribute('data-tone')).toBe('good');
        const down = orders!.querySelector('.aparte-stats__change')!;
        expect([down.getAttribute('data-direction'), down.getAttribute('data-tone'), text(down, '.aparte-stats__arrow'), text(down, '.aparte-stats__delta')])
            .toEqual(['down', 'bad', '▼', '−5%']);
        // Churn going down is the good news.
        expect(churn!.querySelector('.aparte-stats__change')!.getAttribute('data-tone')).toBe('good');
        expect(response!.querySelector('.aparte-stats__change')).toBeNull();
        expect(response!.hasAttribute('data-tone')).toBe(false);
    });

    it('says good or bad in words too, never by its colour alone', () => {
        const card = draw(call('resolved', WEEK));
        const [revenue, orders] = [...card.querySelectorAll('.aparte-stats__tile')];
        const said = (tile: Element | undefined) => tile!.querySelector('.aparte-stats__pill .aparte-sr-only')?.textContent;
        expect(said(revenue)).toBe(' good');
        expect(said(orders)).toBe(' bad');
        // And a shape for the eye: a check or an exclamation, not only green or red.
        const seen = (tile: Element | undefined) => tile!.querySelector('.aparte-stats__verdict');
        expect(seen(revenue)?.textContent).toBe('✓');
        expect(seen(orders)?.textContent).toBe('!');
        expect(seen(revenue)?.getAttribute('aria-hidden')).toBe('true');
        const neutral = draw(call('resolved', [{ label: 'Visits', value: 10, change: 0.3 }]));
        expect(neutral.querySelector('.aparte-stats__pill .aparte-sr-only')).toBeNull();
        expect(neutral.querySelector('.aparte-stats__verdict')).toBeNull();
        aparteGlobalConfig.extendLocale({ tag: 'fr-FR' });
        aparteGlobalConfig.getToolRenderer('get_kpis')!.relabel!(card, call('resolved', WEEK));
        expect(said(revenue)).toBe(' favorable');
    });

    it('is neutral when nobody said which way is good, and when it did not move', () => {
        const card = draw(call('resolved', [{ label: 'Visits', value: 10, change: 0.3 }, { label: 'Flat', value: 3, change: 0, good: 'up' }]));
        const [visits, flat] = [...card.querySelectorAll('.aparte-stats__change')];
        expect(visits!.getAttribute('data-tone')).toBe('neutral');
        expect(flat!.getAttribute('data-tone')).toBe('neutral');
        expect(flat!.getAttribute('data-direction')).toBe('flat');
        expect(flat!.querySelector('.aparte-stats__arrow')).toBeNull();
        expect(text(flat!, '.aparte-stats__delta')).toBe('0%');
    });

    it('reads a number up to 1 as a ratio and above it as a percentage; text with "%" and changePercent are never ambiguous', () => {
        expect(stat({ label: 'a', value: 1, change: 0.12 }).change).toBeCloseTo(0.12);
        expect(stat({ label: 'a', value: 1, change: 12 }).change).toBeCloseTo(0.12);
        expect(stat({ label: 'a', value: 1, change: -1 }).change).toBe(-1);
        expect(stat({ label: 'a', value: 1, change: 1 }).change).toBe(1);
        expect(stat({ label: 'a', value: 1, change: '1%' }).change).toBeCloseTo(0.01);
        expect(stat({ label: 'a', value: 1, change: '−3,5 %' }).change).toBeCloseTo(-0.035);
        expect(stat({ label: 'a', value: 1, change: '+250%' }).change).toBeCloseTo(2.5);
        expect(stat({ label: 'a', value: 1, changePercent: 0.5 }).change).toBeCloseTo(0.005);
        expect(stat({ label: 'a', value: 1, change: '+12' }).change).toBeCloseTo(0.12);
        expect(stat({ label: 'a', value: 1, change: 'n/a' }).change).toBeUndefined();
        expect(statChange(config, stat({ label: 'a', value: 1, change: 0.125 }))).toBe('+12.5%');
    });

    it('writes an absolute change in the figure’s own unit', () => {
        const money = stat({ label: 'Revenue', value: 12000, currency: 'EUR', change: -1200, changeFormat: 'absolute' });
        expect(money.changeFormat).toBe('absolute');
        expect(statChange(config, money)).toBe('−€1,200');
        expect(statChange(config, stat({ label: 'Orders', value: 340, delta: 25, changeFormat: 'absolute' }))).toBe('+25');
        expect(statChange(config, stat({ label: 'Speed', value: 12, unit: 'kilometer-per-hour', change: 3, changeFormat: 'absolute' }))).toBe('+3 km/h');
        expect(statChange(config, stat({ label: 'Wait', value: 600, format: 'duration', change: -300, changeFormat: 'absolute' }))).toBe('−5 min');
        expect(statChange(config, stat({ label: 'Wait', value: 600, format: 'duration', change: 0, changeFormat: 'absolute' }))).toBe('0 sec');
        // A percentage figure in percent moves in points: 12 % up 0.5 is 12.5 %.
        expect(statChange(config, stat({ label: 'Rate', value: 12, format: 'percent', change: 0.5, changeFormat: 'absolute' }))).toBe('+0.5%');
        expect(statChange(config, stat({ label: 'Rate', value: 0.12, format: 'percent', change: 0.005, changeFormat: 'absolute' }))).toBe('+0.5%');
        expect(statChange(config, stat({ label: 'Tier', value: 'Gold', change: 2, changeFormat: 'absolute' }))).toBe('+2');
        // An absolute change written with "%" is a percentage after all.
        expect(stat({ label: 'a', value: 1, change: '+4%', changeFormat: 'absolute' }).changeFormat).toBe('percent');
        expect(statChange(config, stat({ label: 'a', value: 5 }))).toBeUndefined();
    });
});

describe('writing the value', () => {
    const v = (raw: Record<string, unknown>) => statValue(config, stat({ label: 'x', ...raw }));

    it('in each format, in the chat’s language', () => {
        expect(v({ value: 1234.567 })).toBe('1,234.57');
        expect(v({ value: 1234.567, digits: 1 })).toBe('1,234.6');
        expect(v({ value: 12000, currency: '€' })).toBe('€12,000');
        expect(v({ value: 12.5, currency: 'USD' })).toBe('$12.50');
        expect(v({ value: 12, format: 'currency' })).toBe('12');
        expect(v({ value: 0.034, format: 'percent' })).toBe('3.4%');
        expect(v({ value: 34, format: 'percent' })).toBe('34%');
        expect(v({ value: '12%' })).toBe('12%');
        expect(v({ value: '250%' })).toBe('250%');
        expect(v({ value: 0.5, format: 'percent', digits: 2 })).toBe('50.00%');
        expect(v({ value: 1_234_000, format: 'compact' })).toBe('1.2M');
        expect(v({ value: 1_234_000, format: 'compact', currency: 'USD' })).toBe('$1.2M');
        expect(v({ value: 45_000, format: 'compact', unit: 'byte' })).toMatch(/^45K byte$/);
        expect(v({ value: 4800, format: 'duration' })).toBe('1 hr 20 min');
        expect(v({ value: 3600, format: 'duration' })).toBe('1 hr');
        expect(v({ value: 93_784, format: 'duration' })).toBe('1 day 2 hr');
        expect(v({ value: 45, format: 'duration' })).toBe('45 sec');
        expect(v({ value: 0.35, format: 'duration' })).toBe('0.4 sec');
        expect(v({ value: 42, unit: 'kilometer' })).toBe('42 km');
        expect(v({ value: 3, unit: 'e-mails' })).toBe('3 e-mails');
        expect(v({ value: 'Gold' })).toBe('Gold');
        expect(v({ value: '4.8/5' })).toBe('4.8/5');
        expect(v({ value: '12,000', format: 'text' })).toBe('12,000');
        expect(v({ value: '12,000' })).toBe('12,000');
        expect(stat({ label: 'x', value: '12,000' }).value).toBe(12000);
        expect(stat({ label: 'x', value: '12' }).format).toBe('number');
        expect(stat({ label: 'x', value: 5, format: 'bogus' }).format).toBe('number');
        expect(stat({ label: 'x', value: 5, format: 'number', unit: 'km', currency: 'EUR' })).toMatchObject({ format: 'number', unit: 'km' });
        expect(stat({ label: 'x', value: 5, digits: 99 }).digits).toBe(6);
    });

    it('falls back to the code after the number for a currency Intl does not take', () => {
        const odd: Stat = { label: 'x', value: 5, format: 'currency', currency: 'ZZZ1', changeFormat: 'percent' };
        expect(statValue(config, odd)).toBe('5 ZZZ1');
        expect(statValue(config, { ...odd, format: 'compact' })).toBe('5');
    });
});

describe('the tiles variant', () => {
    beforeEach(() => {
        stop = setupStatsCard({ tool: 'get_kpis' });
    });

    it('lays the tiles in two or three columns, never a lone tile on a row of three', () => {
        const columns = (n: number) => draw(call('resolved', Array.from({ length: n }, (_, i) => ({ label: `S${i}`, value: i })))).querySelector('.aparte-stats__tiles')!.getAttribute('data-columns');
        expect([1, 2, 3, 4, 5, 6, 7].map(columns)).toEqual(['1', '2', '3', '2', '3', '3', '3']);
    });

    it('draws each tile: icon, label, value, change, hint, then the sparkline in the change’s colour', () => {
        const card = draw(call('resolved', WEEK));
        const list = card.querySelector('ul.aparte-stats__tiles')!;
        expect(list.getAttribute('role')).toBe('list');
        const tile = list.querySelector(':scope > li.aparte-stats__tile')!;
        expect([...tile.children].map((c) => c.className.split(' ')[0])).toEqual(['aparte-stats__label', 'aparte-stats__value', 'aparte-stats__change', 'aparte-stats__spark']);
        expect(tile.querySelector('.aparte-stats__icon svg')).not.toBeNull();
        expect(tile.querySelector('.aparte-stats__icon')!.getAttribute('aria-hidden')).toBe('true');
        const spark = tile.querySelector('.aparte-stats__spark')!;
        expect(spark.getAttribute('aria-hidden')).toBe('true');
        expect(spark.querySelector('svg.aparte-stats__sparkline .aparte-rich-card__sparkline-line')).not.toBeNull();
        expect(spark.querySelector('.aparte-rich-card__sparkline-area')).toBeNull();
        expect(tile.hasAttribute('data-trend')).toBe(true);
        const churn = list.children[2]!;
        expect(text(churn, '.aparte-stats__hint')).toBe('Monthly');
        expect(churn.querySelector('.aparte-stats__spark')).toBeNull();
    });

    it('keeps twelve figures at most', () => {
        const many = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`Metric ${i + 1}`, i]));
        const card = draw(call('resolved', many));
        expect(card.querySelectorAll('.aparte-stats__tile')).toHaveLength(12);
        expect(card.getAttribute('aria-label')).toBe('12 figures');
    });

    it('draws no header or footer when the data has none', () => {
        const card = draw(call('resolved', REVENUE));
        expect(card.querySelector('.aparte-stats__head, .aparte-stats__foot')).toBeNull();
        expect(card.firstElementChild!.classList.contains('aparte-stats__body')).toBe(true);
        const noteOnly = draw(call('resolved', { items: [ORDERS], footnote: 'Shopify' }));
        expect(noteOnly.querySelector('.aparte-stats__updated')).toBeNull();
        expect(text(noteOnly, '.aparte-stats__foot')).toBe('Shopify');
        const subOnly = draw(call('resolved', { items: [ORDERS], subtitle: 'Today' }));
        expect(subOnly.querySelector('.aparte-stats__title')).toBeNull();
        expect(text(subOnly, '.aparte-stats__subtitle')).toBe('Today');
    });
});

describe('the list variant', () => {
    beforeEach(() => {
        stop = setupStatsCard({ tool: 'get_kpis', variant: 'list' });
    });

    it('is a fact sheet: a <dl> of rows, label and hint in the term, value and change in the description', () => {
        const card = draw(call('resolved', WEEK));
        expect(card.dataset.variant).toBe('list');
        const list = card.querySelector('dl.aparte-stats__list')!;
        const rows = [...list.querySelectorAll(':scope > div.aparte-stats__row')];
        expect(rows).toHaveLength(4);
        expect(rows.map((r) => text(r, 'dt .aparte-stats__label-text'))).toEqual(['Revenue', 'Orders', 'Churn', 'Response time']);
        expect(rows.map((r) => text(r, 'dd .aparte-stats__value'))).toEqual(['$12,000', '340', '2.1%', '1 hr 20 min']);
        expect(text(rows[2]!, 'dt .aparte-stats__hint')).toBe('Monthly');
        expect(text(rows[0]!, 'dd .aparte-stats__delta')).toBe('+12%');
        expect(rows[0]!.querySelector('dd .aparte-stats__spark svg')).not.toBeNull();
        expect(rows[3]!.querySelector('.aparte-stats__change, .aparte-stats__spark')).toBeNull();
    });

    it('has a skeleton of rows', () => {
        const card = draw(call('pending', undefined, { title: 'Inventory' }));
        expect(card.querySelectorAll('.aparte-stats__list .aparte-stats__row .aparte-stats__sk-value')).toHaveLength(4);
        expect(text(card, '.aparte-stats__title')).toBe('Inventory');
    });
});

describe('the hero variant', () => {
    beforeEach(() => {
        stop = setupStatsCard({ tool: 'get_kpis', variant: 'hero' });
    });

    it('draws the first figure large over a wide chart with its area, the others small beneath', () => {
        const card = draw(call('resolved', WEEK));
        const hero = card.querySelector('.aparte-stats__hero')!;
        expect(text(hero, '.aparte-stats__label-text')).toBe('Revenue');
        expect(text(hero, '.aparte-stats__hero-figure .aparte-stats__value')).toBe('$12,000');
        expect(text(hero, '.aparte-stats__hero-figure .aparte-stats__change-label')).toBe('vs last week');
        expect(hero.querySelector('.aparte-stats__spark .aparte-rich-card__sparkline-area')).not.toBeNull();
        const minis = card.querySelector('dl.aparte-stats__minis')!;
        expect(minis.getAttribute('data-count')).toBe('3');
        const items = [...minis.querySelectorAll(':scope > .aparte-stats__mini')];
        expect(items.map((m) => text(m, 'dt'))).toEqual(['Orders', 'Churn', 'Response time']);
        expect(items.map((m) => text(m, 'dd.aparte-stats__value'))).toEqual(['340', '2.1%', '1 hr 20 min']);
        // The small figures keep the change's pill without its comparison.
        expect(text(items[0]!, 'dd.aparte-stats__mini-change .aparte-stats__delta')).toBe('−5%');
        expect(items[0]!.querySelector('.aparte-stats__change-label')).toBeNull();
        expect(items[2]!.querySelector('.aparte-stats__mini-change')).toBeNull();
    });

    it('draws one figure alone, without the band', () => {
        const card = draw(call('resolved', { ...REVENUE, hint: 'Gross' }));
        expect(card.querySelector('.aparte-stats__minis')).toBeNull();
        expect(text(card, '.aparte-stats__hero .aparte-stats__hint')).toBe('Gross');
    });

    it('has a skeleton of its shape', () => {
        const card = draw(call('pending'));
        expect(card.querySelector('.aparte-stats__hero .aparte-stats__sk-chart')).not.toBeNull();
        expect(card.querySelectorAll('.aparte-stats__minis .aparte-stats__mini')).toHaveLength(3);
    });
});

describe('choosing a variant', () => {
    it('picks one per result, and reads an unknown name as the default', () => {
        stop = setupStatsCard({ tool: 'get_kpis', variant: (d) => (d.items.length > 4 ? 'list' : 'hero') });
        expect(draw(call('resolved', WEEK)).dataset.variant).toBe('hero');
        expect(draw(call('resolved', { a: 1, b: 2, c: 3, d: 4, e: 5 })).dataset.variant).toBe('list');
        stop();
        stop = setupStatsCard({ tool: 'get_kpis', variant: 'nope' as never });
        expect(draw(call('resolved', WEEK)).dataset.variant).toBe('tiles');
    });
});

describe('the stats card as a segment', () => {
    it('draws a card segment, and its fallback says each figure with its change', () => {
        stop = setupStatsCard();
        const segment = statsCard.segment(WEEK, { variant: 'list' });
        expect(segment.fallback).toBe('Revenue: $12,000 (+12% vs last week); Orders: 340 (−5%); Churn: 2.1% (−40%); Response time: 1 hr 20 min');
        const out = getSegmentRenderer('card')!.render(segment as never) as HTMLElement;
        expect(out.dataset.card).toBe('stats');
        expect(out.dataset.variant).toBe('list');
        expect(out.querySelectorAll('.aparte-stats__row')).toHaveLength(4);
        expect(statsCard.segment({ Visitors: 1200 }).fallback).toBe('Visitors: 1,200');
        expect(statsCard.segment('nothing').fallback).toBeUndefined();
    });
});

describe('reading the data', () => {
    it('reads an envelope, a list, one figure and a record', () => {
        expect(readStats(WEEK)).toMatchObject({ title: 'Sales this week', subtitle: 'Mon–Sun', footnote: 'Source: Stripe' });
        expect(readStats(WEEK)!.updatedAt).toEqual(new Date('2026-10-30T14:05:00Z'));
        expect(readStats([REVENUE, ORDERS])!.items).toHaveLength(2);
        expect(readStats(REVENUE)!.items[0]!.label).toBe('Revenue');
        const record = readStats({ Revenue: 12000, Orders: 340, conversionRate: '3.4%', tier: 'Gold', nested: [1, 2], nothing: null, title: 'Today', as_of: 1_761_832_800 })!;
        expect(record.title).toBe('Today');
        expect(record.updatedAt).toBeInstanceOf(Date);
        expect(record.items.map((s) => [s.label, s.value])).toEqual([['Revenue', 12000], ['Orders', 340], ['Conversion rate', 0.034], ['Tier', 'Gold']]);
        expect(readStats({ metrics: { Revenue: { value: 5, change: 0.1 } }, heading: 'H' })).toMatchObject({ title: 'H', items: [{ label: 'Revenue', value: 5, change: 0.1 }] });
        expect(readStats({ kpis: [{ name: 'A', amount: 1 }] })!.items[0]).toMatchObject({ label: 'A', value: 1 });
        expect(readStats({ title: 'Q3', period: 'Jul–Sep', stats: [{ key: 'k', count: 2 }], source: 'ERP', updatedAt: 'not a date' })).toMatchObject({ subtitle: 'Jul–Sep', footnote: 'ERP' });
        expect(readStats({ stats: [{ key: 'k', count: 2 }], updatedAt: 'not a date' })!.updatedAt).toBeUndefined();
        expect(readStats(null)).toBeNull();
        expect(readStats('12')).toBeNull();
        expect(readStats({ items: [] })).toBeNull();
        expect(readStats({ label: 'x', value: { nope: 1 } })).toBeNull();
        expect(readStats({ label: 'x', value: '   ' })).toBeNull();
    });

    it('reads the usual spellings of each field', () => {
        const s = stat({
            title: 'Signups', total: '1,250', diff: '+8%', comparison: 'vs yesterday', lowerIsBetter: false,
            history: [{ value: 1 }, [0, 2], '3', 'x', { y: 4 }], description: 'New accounts', icon: 'users', decimals: 0, currency_code: 'eur', format: 'number',
        });
        expect(s).toMatchObject({ label: 'Signups', value: 1250, change: 0.08, changeLabel: 'vs yesterday', good: 'up', trend: [1, 2, 3, 4], hint: 'New accounts', icon: 'users', digits: 0, format: 'number' });
        expect(stat({ name: 'A', amount: 3, variation: -0.2, series: [1, 2] })).toMatchObject({ label: 'A', value: 3, change: -0.2, trend: [1, 2] });
        expect(stat({ key: 'A', count: 3, delta: 5, sparkline: [1] })).toMatchObject({ change: 0.05 });
        expect(stat({ key: 'A', count: 3, sparkline: [1] }).trend).toBeUndefined();
        expect(stat({ label: 'A', value: 1, values: Array.from({ length: 100 }, (_, i) => i) }).trend).toHaveLength(60);
        expect(stat({ label: 'A', value: 1, good: 'lower' }).good).toBe('down');
        expect(stat({ label: 'A', value: 1, good: 'higher' }).good).toBe('up');
        expect(stat({ label: 'A', value: 1, invert: true }).good).toBe('down');
        expect(stat({ label: 'A', value: 1, higherIsBetter: false }).good).toBe('down');
        expect(stat({ label: 'A', value: 1, good: 'sideways' }).good).toBeUndefined();
        expect(stat({ label: 'A', value: 1, icon: 'rocket' }).icon).toBeUndefined();
        expect(stat({ label: 'A', value: 1, icon: 'toString' }).icon).toBeUndefined();
        // A comparison with nothing to compare is dropped.
        expect(stat({ label: 'A', value: 1, changeLabel: 'vs last week' }).changeLabel).toBeUndefined();
    });

    it('moves a percentage written as text by points, not by a hundred times them', () => {
        const rate = stat({ label: 'Rate', value: '12%', change: 0.5, changeFormat: 'absolute' });
        expect(rate.change).toBeCloseTo(0.005);
        expect(statChange(config, rate)).toBe('+0.5%');
    });

    it('reads an object with a title and several numbers as a record, not as one figure', () => {
        const week = readStats({ title: 'This week', total: 4200, count: 87, refunds: 3 })!;
        expect(week.title).toBe('This week');
        expect(week.items.map((s) => [s.label, s.value])).toEqual([['Total', 4200], ['Count', 87], ['Refunds', 3]]);
        // A title with one value and the fields of a figure is still that figure.
        expect(readStats({ title: 'Signups', total: 1250, change: 0.1, period: 'Today' })!.items).toMatchObject([{ label: 'Signups', value: 1250, change: 0.1 }]);
        expect(readStats({ id: 'rev', name: 'Revenue', value: 5 })!.items).toMatchObject([{ label: 'Revenue', value: 5 }]);
    });

    it("takes a record's currency and unit as how its figures are written, never as figures", () => {
        const sales = readStats({ revenue: 1200, orders: 30, avgOrderValue: 40, refundRate: 0.02, currency: 'EUR' })!;
        expect(sales.items.map((s) => [s.label, s.format, s.currency])).toEqual([
            ['Revenue', 'currency', 'EUR'], ['Orders', 'number', undefined], ['Avg order value', 'currency', 'EUR'], ['Refund rate', 'number', undefined],
        ]);
        expect(statValue(config, sales.items[0]!)).toBe('€1,200');
        // A figure's own currency or format wins.
        expect(readStats({ revenue: { value: 9, currency: 'USD' }, cost: { value: 3, format: 'number' }, currency: 'EUR' })!.items.map((s) => s.currency)).toEqual(['USD', undefined]);
        const trip = readStats({ distance: 12, climb: 900, unit: 'kilometer' })!;
        expect(trip.items.map((s) => [s.label, s.unit])).toEqual([['Distance', 'kilometer'], ['Climb', 'kilometer']]);
        expect(readStats({ metrics: { Revenue: 5 }, currency: 'GBP' })!.items[0]).toMatchObject({ format: 'currency', currency: 'GBP' });
    });

    it('draws a date-only updatedAt as that day where the reader is, with no time it was not given', () => {
        stop = setupStatsCard({ tool: 'get_kpis' });
        const data = readStats({ items: [ORDERS], updatedAt: '2026-10-30' })!;
        expect(data.updatedAt).toEqual(new Date(2026, 9, 30));
        const card = draw(call('resolved', { items: [ORDERS], updatedAt: '2026-10-30' }));
        expect(card.querySelector('time.aparte-stats__updated')!.textContent).toBe('Updated Fri, Oct 30');
    });

    it('turns a record’s keys into labels', () => {
        expect(humanizeKey('conversionRate')).toBe('Conversion rate');
        expect(humanizeKey('avg_order_value')).toBe('Avg order value');
        expect(humanizeKey('totalMRR')).toBe('Total MRR');
        expect(humanizeKey('MRR')).toBe('MRR');
        expect(humanizeKey('Net revenue')).toBe('Net revenue');
        expect(humanizeKey('page-views')).toBe('Page views');
        expect(humanizeKey('HTTPRequests')).toBe('HTTP requests');
    });
});

describe('labels', () => {
    it('names the card by its title, its one figure, or its count', () => {
        stop = setupStatsCard({ tool: 'get_kpis' });
        expect(draw(call('resolved', [ORDERS])).getAttribute('aria-label')).toBe('Orders');
        expect(draw(call('resolved', [ORDERS, REVENUE, CHURN])).getAttribute('aria-label')).toBe('3 figures');
        expect(draw(call('resolved', { title: 'T', items: [ORDERS] })).getAttribute('aria-label')).toBe('T');
    });
});
