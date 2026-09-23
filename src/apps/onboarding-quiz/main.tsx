import React from 'react';
import ReactDOM from 'react-dom/client';
import OnboardingQuiz from './OnboardingQuiz';
import '../../styles/tailwind.build.css';
import './onboarding-quiz.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OnboardingQuiz />
  </React.StrictMode>,
);
