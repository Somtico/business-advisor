import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { SessionTimeoutGuard } from './components/SessionTimeoutGuard';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SessionTimeoutGuard />
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
