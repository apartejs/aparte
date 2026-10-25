import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { aparteGlobalConfig } from '@aparte/core';
import { AparteToolUI, AparteSegmentUI } from '../components/AparteToolUI';

describe('<AparteToolUI> on the server', () => {
    it('renders nothing on the server, and declares nothing there', () => {
        const before = aparteGlobalConfig.getToolRenderer('get_weather');
        const html = renderToString(
            <div id="page">
                <AparteToolUI name="get_weather">{() => <span className="card" />}</AparteToolUI>
                <AparteSegmentUI type="chart">{() => <span className="chart" />}</AparteSegmentUI>
            </div>,
        );
        expect(html).toBe('<div id="page"></div>');
        // A registration on the server would be shared by every request the process serves.
        expect(aparteGlobalConfig.getToolRenderer('get_weather')).toBe(before);
    });
});
