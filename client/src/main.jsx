import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider, ConfirmProvider, PromptProvider } from './components/ui';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <ToastProvider>
      <ConfirmProvider>
        <PromptProvider>
          <App />
        </PromptProvider>
      </ConfirmProvider>
    </ToastProvider>
  </BrowserRouter>,
);
