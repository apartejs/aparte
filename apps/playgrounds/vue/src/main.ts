import { createApp } from 'vue';
import { setupAparte } from './aparte';
import './style.css';
import App from './App.vue';

setupAparte();
createApp(App).mount('#app');
