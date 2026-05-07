import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';

// Полная регистрация через workbox-window: проверка обновлений и перезагрузка при новой версии.
// Без этого однострочный registerSW.js из билда только регистрирует SW и не подхватывает деплои после F5.
registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

