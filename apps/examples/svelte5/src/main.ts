import { mount } from 'svelte';
import { setupAparte } from './aparte';
import './style.css';
import App from './App.svelte';

setupAparte();

// `mount(App, …)` instead of `new App(…)` — the only difference between this app and
// its Svelte 4 twin, and it is in the APP's bootstrap, not in `@aparte/svelte`.
// Svelte 5 removed the class-instantiation API; the wrapper's own components compile
// and run unchanged from the same shipped source.
const app = mount(App, { target: document.getElementById('app')! });

export default app;
