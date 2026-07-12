// Vitest setup for @aparte/core
import { beforeAll, vi } from 'vitest';

// Polyfill ResizeObserver for jsdom
if (typeof global.ResizeObserver === 'undefined') {
    global.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}

// Mock window.customElements if not available
beforeAll(() => {
    if (typeof window !== 'undefined' && !window.customElements) {
        (window as any).customElements = {
            define: vi.fn(),
            get: vi.fn(),
            whenDefined: vi.fn(() => Promise.resolve())
        };
    }
});
