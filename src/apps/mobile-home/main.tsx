import React from 'react';
import ReactDOM from 'react-dom/client';
import { SpeedInsights } from '@vercel/speed-insights/react';
import MobileHome from './MobileHome';
import '../../styles/tailwind.build.css'; // shared Tailwind utilities (see tailwind.config.js)
import './mobile-home.css'; // island-specific CSS (fonts, keyframes)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MobileHome />
    <SpeedInsights />
  </React.StrictMode>,
);
