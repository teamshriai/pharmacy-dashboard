import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './design/index.css';
import { ErrorBoundary } from './ErrorBoundary';
import PharmacyApp from './PharmacyApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <PharmacyApp />
    </ErrorBoundary>
  </StrictMode>
);
