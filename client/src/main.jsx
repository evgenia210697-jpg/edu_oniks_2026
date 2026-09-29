import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider, ConfirmProvider } from './components/ui';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <ToastProvider>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </ToastProvider>
  </BrowserRouter>,
);
