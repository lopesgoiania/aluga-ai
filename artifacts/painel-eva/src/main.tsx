import { createRoot } from 'react-dom/client';

import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';
import './utility.css';
import './interaction.css';

import App from './LiveApp';

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
