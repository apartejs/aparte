import { setupAparte } from './aparte';
import './style.css';
import App from './App.svelte';

setupAparte();

const app = new App({ target: document.getElementById('app')! });

export default app;
