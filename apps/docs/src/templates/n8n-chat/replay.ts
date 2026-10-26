/**
 * The n8n behind the demo: a `fetch` that answers the way a Chat Trigger does, so the real
 * `createChat` — its runner, its history request, its stream reader — runs with no server.
 *
 * The frames are n8n's own, as a live n8n 2.44.6 sent them (packages/providers/agent/n8n/src/
 * __tests__/fixtures/v2.44-*): `begin`, a stream of `item` pieces the size a model's tokens
 * come in, `end`, all labelled `application/json`. What it cannot record is the model, so the
 * answers are written here, by question, in the bakery's voice.
 */

const NODE = { nodeId: '6f1c9b2e-4d1a-4c55-9a43-2f6d0e8b7a10', nodeName: 'AI Agent', itemIndex: 0, runIndex: 0 };

interface Answer { match: RegExp; en: string; fr: string }

const ANSWERS: Answer[] = [
    {
        match: /gluten|sans gluten|celiac|cœliaque/i,
        en: 'Yes — two gluten-free loaves, baked on Fridays and Saturdays in a separate oven:\n\n- **Buckwheat & seeds** — €5.40\n- **Rice & chestnut** — €5.90\n\nWant me to set one aside for you?',
        fr: 'Oui — deux pains sans gluten, cuits le vendredi et le samedi dans un four à part :\n\n- **Sarrasin & graines** — 5,40 €\n- **Riz & châtaigne** — 5,90 €\n\nJe vous en mets un de côté ?',
    },
    {
        match: /hour|open|close|when|horaire|ouvert|ferm|quand/i,
        en: 'We are open **Tuesday to Sunday, 7 am to 7 pm**, and closed on Mondays. The first baguettes come out at 7:15.',
        fr: 'Nous sommes ouverts **du mardi au dimanche, de 7 h à 19 h**, fermés le lundi. Les premières baguettes sortent à 7 h 15.',
    },
    {
        match: /price|cost|how much|€|prix|combien|tarif/i,
        en: 'Our everyday prices:\n\n| Item | Price |\n| --- | ---: |\n| Baguette | €1.30 |\n| Croissant | €1.20 |\n| Sourdough loaf | €4.80 |\n| Pain au chocolat | €1.40 |',
        fr: 'Nos prix du quotidien :\n\n| Produit | Prix |\n| --- | ---: |\n| Baguette | 1,30 € |\n| Croissant | 1,20 € |\n| Pain au levain | 4,80 € |\n| Pain au chocolat | 1,40 € |',
    },
    {
        match: /order|reserve|saturday|set aside|commande|réserv|samedi|côté/i,
        en: 'With pleasure. Tell me **what** you would like and **when** you will pick it up — orders placed before 6 pm are ready the next morning.',
        fr: 'Avec plaisir. Dites-moi **quoi** et **quand** vous passez le prendre — une commande passée avant 18 h est prête le lendemain matin.',
    },
    {
        match: /sell|bread|menu|bake|have|vend|pain|propos|carte/i,
        en: 'Everything is baked here each morning:\n\n- **Sourdough** and country loaves\n- **Baguettes**, plain or with seeds\n- **Croissants** and **pains au chocolat**\n- Gluten-free loaves on Fridays and Saturdays\n\nAnything I can set aside for you?',
        fr: 'Tout est cuit ici chaque matin :\n\n- **Pain au levain** et pains de campagne\n- **Baguettes**, nature ou aux graines\n- **Croissants** et **pains au chocolat**\n- Pains sans gluten le vendredi et le samedi\n\nJe vous mets quelque chose de côté ?',
    },
];

const FALLBACK = {
    en: 'This demo replays an n8n workflow, so it knows a few questions: **what we bake**, **gluten-free bread**, **opening hours** and **prices**. Paste your own Chat Trigger URL beside the chat to talk to your workflow instead.',
    fr: 'Cette démo rejoue un workflow n8n : elle connaît quelques questions — **ce que nous cuisons**, **le sans gluten**, **les horaires** et **les prix**. Collez l’URL de votre Chat Trigger à côté du chat pour parler à votre workflow.',
};

/** The answer to a question, in the chat's language. */
export function answerFor(question: string, language: 'en' | 'fr'): string {
    return ANSWERS.find((a) => a.match.test(question))?.[language] ?? FALLBACK[language];
}

/** Pieces the size a model streams: a word with the space before it, punctuation alone. */
function tokens(text: string): string[] {
    return text.match(/\s*[^\s.,!?;:—|*-]+|\s*[.,!?;:—|*-]+|\s+/g) ?? [text];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** n8n's stream for one answer: the frames, paced like a model unless `instant`. */
function streamOf(text: string, instant: boolean): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const frame = (value: object) => encoder.encode(`${JSON.stringify(value)}\n`);
    return new ReadableStream({
        async start(controller) {
            const meta = () => ({ ...NODE, timestamp: Date.now() });
            controller.enqueue(frame({ type: 'begin', metadata: meta() }));
            if (!instant) await sleep(650);
            for (const piece of tokens(text)) {
                controller.enqueue(frame({ type: 'item', content: piece, metadata: meta() }));
                if (!instant) await sleep(28);
            }
            controller.enqueue(frame({ type: 'end', metadata: meta() }));
            controller.close();
        },
    });
}

/** A `fetch` that is a Chat Trigger: history first (none), then a streamed answer per message. */
export function replayFetch(language: () => 'en' | 'fr', { instant = false } = {}): typeof fetch {
    return (async (_input: RequestInfo | URL, init?: RequestInit) => {
        const headers = { 'content-type': 'application/json; charset=utf-8' };
        const body = init?.body;
        const fields = typeof body === 'string' ? JSON.parse(body) as Record<string, unknown> : body instanceof FormData ? Object.fromEntries(body.entries()) : {};
        if (fields['action'] === 'loadPreviousSession') return new Response('{"data":[]}', { status: 200, headers });
        const question = String(fields['chatInput'] ?? '');
        return new Response(streamOf(answerFor(question, language()), instant), { status: 200, headers });
    }) as typeof fetch;
}
