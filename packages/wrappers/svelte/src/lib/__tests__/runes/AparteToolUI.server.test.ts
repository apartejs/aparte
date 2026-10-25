import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import { aparteGlobalConfig } from '@aparte/core';
import ToolUIHost from './ToolUIHost.svelte';
import SegmentUIHost from './SegmentUIHost.svelte';

describe('<AparteToolUI> for Svelte 5, on the server', () => {
    it('renders nothing on the server, and declares nothing there', () => {
        const before = aparteGlobalConfig.getToolRenderer('get_weather');
        const tools = render(ToolUIHost, { props: { lower: true } });
        const segments = render(SegmentUIHost, { props: {} });
        expect(tools.body).not.toContain('weather');
        expect(tools.body).not.toContain('lower');
        expect(segments.body).not.toContain('chart');
        // A registration on the server would be shared by every request the process serves.
        expect(aparteGlobalConfig.getToolRenderer('get_weather')).toBe(before);
    });
});
