// jsdom has no ResizeObserver, which the viewport and the composer observe with; nor object
// URLs, which the user bubble shows its file chips by.
if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}
URL.createObjectURL ??= () => 'blob:aparte-test';
URL.revokeObjectURL ??= () => undefined;
