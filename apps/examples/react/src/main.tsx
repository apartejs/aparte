import { createRoot } from 'react-dom/client';
import { setupAparte } from './aparte';
import { isWorkbenchView } from './workbench-setup';
import { isSettingsView } from './settings-store';
import './style.css';
import App from './App';
import Workbench from './Workbench';
import Settings from './Settings';

/**
 * Two views, chosen by the URL rather than by a click, so both are deep-linkable
 * (and a browser test can land on one directly).
 *
 * `setupAparte()` configures the page-GLOBAL config, which is what the single-chat
 * view uses. The workbench builds its own two configs instead and must not inherit
 * a provider or a transport from the global — so it deliberately does not call it.
 */
const workbench = isWorkbenchView();
// The settings view edits the GLOBAL config, so it needs the same setup the chat
// view runs. Only the workbench opts out — it builds its own two configs.
if (!workbench) setupAparte();

const root = document.getElementById('root');
const view = workbench ? <Workbench /> : isSettingsView() ? <Settings /> : <App />;
if (root) createRoot(root).render(view);
