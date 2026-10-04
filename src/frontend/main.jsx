import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { TournamentFeatureProvider } from './toernooi/feature.jsx';
import { RefereeFeatureProvider } from './scheids/feature.jsx';
import { CalendarFeatureProvider } from './agenda/feature.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <TournamentFeatureProvider>
          <RefereeFeatureProvider>
            <CalendarFeatureProvider>
              <App />
            </CalendarFeatureProvider>
          </RefereeFeatureProvider>
        </TournamentFeatureProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
