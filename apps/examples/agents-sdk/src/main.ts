/**
 * The page: aparté, reading the agent's AG-UI stream. It knows nothing about the Agents SDK,
 * OpenAI or the model — swap the server behind `/agent` and this file stays as it is.
 */
import '@aparte/core/styles.css';
import { AparteClient } from '@aparte/core';
import { createAgUiRunner } from '@aparte/runner-ag-ui';

new AparteClient({ streamRunner: createAgUiRunner({ endpoint: '/agent' }) }).start();
