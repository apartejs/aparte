import { setupSite } from '../../_shared/site-setup';
import './style.css';
import App from './App.svelte';

// Awaited before the first render: the highlighter and the providers have to be
// there before a conversation opens. A `.then`, not a top-level await: the production
// build targets browsers a step behind it, and esbuild refuses it.
void setupSite().then(({ scenarioMode }) => {
    new App({ target: document.getElementById('app')!, props: { scenarioMode } });
});
