import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './design/index.css';
import PharmacyApp from './PharmacyApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PharmacyApp />
  </StrictMode>
);
