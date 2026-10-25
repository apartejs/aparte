import { createContext, useContext, useEffect } from 'react';
import { AparteToolUI, type AparteToolCallView } from '@aparte/react';
import { FRAMEWORK_CARD, SITE_NAME, noteCardMounted, noteCardUnmounted, weatherLine } from '../../_shared/framework-card';

/** App context the card reads — it renders from where `<AparteToolUI>` is declared. */
const SiteName = createContext('');

function WeatherCard({ tool }: { tool: AparteToolCallView }) {
    const site = useContext(SiteName);
    useEffect(() => { noteCardMounted(); return noteCardUnmounted; }, []);
    return (
        <div className="framework-card" data-testid="framework-weather-card">
            {weatherLine(tool)} <small>· {site}</small>
        </div>
    );
}

/** `?framework-card`: the `get_weather` call drawn by a React component (see `_shared/framework-card.ts`). */
export function FrameworkWeatherCard() {
    if (!FRAMEWORK_CARD) return null;
    return (
        <SiteName.Provider value={SITE_NAME}>
            <AparteToolUI name="get_weather">{(tool) => <WeatherCard tool={tool} />}</AparteToolUI>
        </SiteName.Provider>
    );
}
