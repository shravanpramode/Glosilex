import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { clearEverything } from './utils/sessionPersistence';

// Clear all session data if the page is reloaded
const navigationEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
if (navigationEntries.length > 0 && navigationEntries[0].type === 'reload') {
  clearEverything();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
