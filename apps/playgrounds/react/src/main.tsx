import { createRoot } from 'react-dom/client';
import { setupAparte } from './aparte';
import './style.css';
import App from './App';

setupAparte();

const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
