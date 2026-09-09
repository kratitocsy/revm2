import React from 'react';
import ReactDOM from 'react-dom/client';
import DesktopDashboard from './DesktopDashboard';
import '../../styles/tailwind.build.css'; // shared Tailwind utilities
import './desktop-dashboard.css'; // fonts, scrollbar hiding

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DesktopDashboard />
  </React.StrictMode>,
);
