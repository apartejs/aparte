import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import { setupItemsCard } from '../items/index.js';
import { setupProductCard } from '../product/index.js';
import { setupCardFences } from './fence.js';

/*
 * An `id` on a card's own action is a button the APP's listener acts on ("Summarise this",
 * "Add to cart"). A card the model wrote in its answer chooses both the label and the data the
 * listener then reads, so it carries links only: the app's buttons for such a card come from
 * `actions(data, { origin })`, which is the app's own code.
 */

const stops: Array<() => void> = [];
afterEach(() => {
    while (stops.length) stops.pop()!();
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function fence(card: string, source: string): Promise<HTMLElement> {
    const language = `card-${card}`;
    const markup = aparteGlobalConfig.getCodeLanguageRenderer(language)!.render({ language, source, open: false } as never) as string;
    const host = document.createElement('div');
    host.innerHTML = markup;
    document.body.append(host);
    await flush();
    return host;
}

const labels = (host: HTMLElement): Array<string | null> =>
    [...host.querySelectorAll('button')].filter((b) => b.className.includes('__action') || b.className.includes('rich-card__action')).map((b) => b.textContent);

describe('a card the model wrote', () => {
    it('draws the links of an items card and not its app buttons', async () => {
        stops.push(setupItemsCard(), setupCardFences());
        const host = await fence('items', JSON.stringify({ items: [{
            title: 'Your order', url: 'https://attacker.example/x',
            actions: [{ label: 'No thanks', id: 'summarise' }, { label: 'Open', url: 'https://attacker.example/open' }],
        }] }));
        expect(labels(host)).toEqual(['Open']);
    });

    it('draws the links of a product card and not its app buttons', async () => {
        stops.push(setupProductCard(), setupCardFences());
        const host = await fence('product', JSON.stringify({
            title: 'Boot', price: '10', currency: 'EUR',
            actions: [{ label: 'Cancel', id: 'add', primary: true }, { label: 'See', url: 'https://attacker.example/boot' }],
        }));
        expect(labels(host)).toEqual(['See']);
    });

    it('still gets the app\'s own buttons from `actions`, which the app wrote', async () => {
        stops.push(setupItemsCard({ actions: () => [{ label: 'Summarise', id: 'summarise' }] }), setupCardFences());
        const host = await fence('items', JSON.stringify({ items: [{ title: 'Your order', actions: [{ label: 'No thanks', id: 'summarise' }] }] }));
        expect(labels(host)).toEqual(['Summarise']);
    });

    it('is unchanged for a tool result, which the app runs', () => {
        stops.push(setupItemsCard({ tool: 'search' }));
        const node = aparteGlobalConfig.getToolRenderer('search')!.render({
            id: 's1', type: 'tool_call', status: 'resolved',
            toolCall: { id: 'c1', name: 'search', input: {} },
            structuredResult: { items: [{ title: 'Hike', actions: [{ label: 'Save', id: 'save' }] }] },
            result: '',
        } as never) as HTMLElement;
        expect([...node.querySelectorAll('button')].map((b) => b.textContent)).toContain('Save');
    });
});
