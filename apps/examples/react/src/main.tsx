import { createRoot } from 'react-dom/client';
import { setupAparte } from './aparte';
import { isWorkbenchView } from './workbench-setup';
import './style.css';
import App from './App';
import Workbench from './Workbench';

/**
 * Two views, chosen by the URL rather than by a click, so both are deep-linkable
 * (and a browser test can land on one directly).
 *
 * `setupAparte()` configures the page-GLOBAL config, which is what the single-chat
 * view uses. The workbench builds its own two configs instead and must not inherit
 * a provider or a transport from the global — so it deliberately does not call it.
 */
const workbench = isWorkbenchView();
if (!workbench) setupAparte();

const root = document.getElementById('root');
if (root) createRoot(root).render(workbench ? <Workbench /> : <App />);
