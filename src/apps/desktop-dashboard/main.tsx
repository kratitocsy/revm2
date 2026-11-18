import React from 'react';
import ReactDOM from 'react-dom/client';
import DesktopDashboard from './DesktopDashboard';
import UpdateNotice from './UpdateNotice';
import '../../styles/tailwind.build.css'; // shared Tailwind utilities
import './desktop-dashboard.css'; // fonts, scrollbar hiding

// The Android app sets __wkEmbedded before any script runs; app-only styles hang off this class.
if ((window as any).__wkEmbedded === true) document.documentElement.classList.add('wk-embedded');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DesktopDashboard />
    <UpdateNotice />
  </React.StrictMode>,
);
