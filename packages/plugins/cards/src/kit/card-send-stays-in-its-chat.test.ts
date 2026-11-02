import { describe, it, expect, afterEach, vi } from 'vitest';
import { aparteGlobalConfig, type AparteToolCallSegment } from '@aparte/core';
import { setupWeatherCard } from '../weather/index.js';

/*
 * A card's `send` goes through the composer of the chat the card is in. The reply a card
 * is drawn in is model-written, and a Markdown provider that keeps `<div data-aparte-chat>`
 * hands the model a chat boundary of its own with no composer inside: the lookup used to
 * stop there, find nothing, and take the first composer on the page — another chat's.
 */

const LILLE = { city: 'Lille', condition: 'clear', temperature: 11, high: 14, low: 7 };

let stop: () => void = () => {};
afterEach(() => {
    stop();
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

function composerOf(sent: string[], name: string): HTMLElement {
    const composer = document.createElement('aparte-composer');
    Object.defineProperties(composer, {
        value: { get: () => '', configurable: true },
        streaming: { value: false, configurable: true },
        panelActive: { value: false, configurable: true },
        setValue: { value: (v: string) => { sent.push(`${name}:${v}`); } },
        submit: { value: () => sent.push(`${name}:<submit>`) },
    });
    return composer;
}

function chat(sent: string[], name: string): HTMLElement {
    // The shape the React, Vue and Svelte wrappers draw.
    const host = document.createElement('div');
    host.setAttribute('data-aparte-chat', '');
    host.id = `chat-${name}`;
    host.append(composerOf(sent, name));
    document.body.append(host);
    return host;
}

function card(): HTMLElement {
    const segment: AparteToolCallSegment = {
        id: 's1', type: 'tool_call', status: 'resolved',
        toolCall: { id: 'c1', name: 'get_weather', input: { city: 'Lille' } },
        structuredResult: LILLE, result: JSON.stringify(LILLE),
    };
    return aparteGlobalConfig.getToolRenderer('get_weather')!.render(segment) as HTMLElement;
}

const press = (el: HTMLElement) => (el.querySelector('.aparte-rich-card__action') as HTMLButtonElement).click();

describe('a card in a reply', () => {
    it('sends to its own chat when the model wrapped it in a chat boundary of its own', () => {
        stop = setupWeatherCard({ tool: 'get_weather', actions: () => [{ label: 'Hourly', send: 'Hourly please' }] });
        const sent: string[] = [];
        chat(sent, 'A');
        const b = chat(sent, 'B');
        // chat B → viewport → bubble → (model) <div data-aparte-chat> → card
        const viewport = document.createElement('div');
        const bubble = document.createElement('aparte-chat-bubble');
        viewport.append(bubble);
        b.append(viewport);
        const forged = document.createElement('div');
        forged.setAttribute('data-aparte-chat', '');
        const drawn = card();
        forged.append(drawn);
        // The bubble draws its shell on connect; the model's markup goes in its content.
        (bubble.querySelector('.aparte-content') ?? bubble).append(forged);

        press(drawn);

        expect(sent).toEqual(['B:Hourly please', 'B:<submit>']);
    });

    it('sends nowhere, rather than to the first composer, when it has no chat and the page holds two', () => {
        stop = setupWeatherCard({ tool: 'get_weather', actions: () => [{ label: 'Hourly', send: 'Hourly please' }] });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const sent: string[] = [];
        chat(sent, 'A');
        chat(sent, 'B');
        const drawn = card();
        document.body.append(drawn);

        press(drawn);

        expect(sent).toEqual([]);
        expect(warn).toHaveBeenCalled();
    });

    it('still sends through the only composer on the page', () => {
        stop = setupWeatherCard({ tool: 'get_weather', actions: () => [{ label: 'Hourly', send: 'Hourly please' }] });
        const sent: string[] = [];
        document.body.append(composerOf(sent, 'only'));
        const drawn = card();
        document.body.append(drawn);

        press(drawn);

        expect(sent).toEqual(['only:Hourly please', 'only:<submit>']);
    });
});
