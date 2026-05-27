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

// PWA: при новой версии SW перезагружаем страницу (registerType: 'autoUpdate' в vite.config).
// controllerchange — когда активировался новый worker; первый запуск без SW пропускаем без reload.
function setupServiceWorkerAutoReload() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  let skipNextControllerChange = !navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (skipNextControllerChange) {
      skipNextControllerChange = false;
      return;
    }
    window.location.reload();
  });
}

setupServiceWorkerAutoReload();

registerSW({
  immediate: true,
  onNeedRefresh() {
    window.location.reload();
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    const checkForUpdate = () => {
      void registration.update();
    };
    checkForUpdate();
    window.addEventListener('focus', checkForUpdate);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    });
    const id = window.setInterval(checkForUpdate, 15 * 60 * 1000);
    window.addEventListener('beforeunload', () => {
      window.removeEventListener('focus', checkForUpdate);
      window.clearInterval(id);
    });
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

