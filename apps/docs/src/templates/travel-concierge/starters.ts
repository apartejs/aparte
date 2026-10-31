/**
 * The questions the starter chips ask (Template.astro draws them, app.ts takes each away once it
 * has been asked) and the landing's showcase types. Each one is a question the script answers
 * (scenario.ts). Kept apart because the page's markup reads them on the server, where nothing
 * that defines an element can be imported.
 */
export const WEATHER_QUESTION = 'What’s the weather like while we’re there?';
export const PLACES_QUESTION = 'Where should we eat near the river?';
export const STAY_QUESTION = 'Can you book us a stay by the river?';
export const PICTURES_QUESTION = 'Show me Porto.';

export const STARTERS = [
    { label: 'Weather for our trip', prompt: WEATHER_QUESTION },
    { label: 'Where to eat by the river', prompt: PLACES_QUESTION },
    { label: 'Book a stay', prompt: STAY_QUESTION },
    { label: 'Show me Porto', prompt: PICTURES_QUESTION },
];
