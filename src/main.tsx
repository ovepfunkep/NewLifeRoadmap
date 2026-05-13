import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { registerSW } from 'virtual:pwa-register';
import App from './App';

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (typeof sentryDsn === 'string' && sentryDsn.trim() !== '') {
  Sentry.init({
    dsn: sentryDsn.trim(),
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.user) {
        delete event.user.email;
        delete event.user.username;
        delete event.user.ip_address;
      }
      return event;
    },
  });
}

// Полная регистрация через workbox-window: проверка обновлений и перезагрузка при новой версии.
// Без этого однострочный registerSW.js из билда только регистрирует SW и не подхватывает деплои после F5.
registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

