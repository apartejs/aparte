import { createApp } from 'vue';
import { setupSite } from '../../_shared/site-setup';
import './style.css';
import App from './App.vue';

// Awaited before the first render: the highlighter and the providers have to
// be there before a conversation opens. A `.then`, not a top-level await: the
// production build targets browsers a step behind it, and esbuild refuses it.
void setupSite().then(({ scenarioMode }) => createApp(App, { scenarioMode }).mount('#app'));
