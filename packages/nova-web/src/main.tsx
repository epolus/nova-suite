/* SPDX-License-Identifier: AGPL-3.0-only */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ensureCryptoRandomUUID } from './utils/ensureCryptoRandomUUID';
import App from './App';
import './index.css';

ensureCryptoRandomUUID();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
