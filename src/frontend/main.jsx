import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { RefereeFeatureProvider } from './scheids/feature.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <RefereeFeatureProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </RefereeFeatureProvider>
    </BrowserRouter>
  </StrictMode>,
);
