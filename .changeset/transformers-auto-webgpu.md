---
'@aparte/provider-transformers': patch
---

Models now run on the graphics card by default when the browser has a WebGPU adapter, as documented; before, `'auto'` fell back to WASM everywhere.

The worker resolves `'auto'` itself, once: `'webgpu'` when `navigator.gpu.requestAdapter()` answers, `'wasm'` otherwise. It is not passed on to Transformers.js, which would try WebNN first. A runner now receives the resolved device in `ctx.device`. `setComputeDevice('webgpu' | 'wasm')` still forces one; there is no need to call it to turn the graphics card on.
