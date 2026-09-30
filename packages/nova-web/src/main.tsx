/* SPDX-License-Identifier: AGPL-3.0-only */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ensureCryptoRandomUUID } from './utils/ensureCryptoRandomUUID';
import App from './App';
import './index.css';

ensureCryptoRandomUUID();

// Eagerly pull shared panels into the entry graph so list routes do not depend
// on a separately fetched /assets/Card-*.js chunk (blocked on demo CF WAF).
void import('@/components/Card');
void import('@/components/ui/card');

// After a deploy, open tabs may still reference old hashed chunks. Reload once
// so the browser picks up the new index.html → asset map.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const key = 'nova:chunk-reload';
  if (!sessionStorage.getItem(key)) {
    sessionStorage.setItem(key, '1');
    window.location.reload();
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
