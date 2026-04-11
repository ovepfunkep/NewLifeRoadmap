import { useEffect } from 'react';
import { NodePage } from './pages/NodePage';
import { SyncManager } from './components/SyncManager';
import { SettingsSyncManager } from './components/SettingsSyncManager';
import { Snowfall } from './components/Snowfall';
import { SpringPetals } from './components/SpringPetals';
import { AMBIENT_SEASON } from './config/ambientSeason';
import { LanguageProvider } from './contexts/LanguageContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { ToastProvider, useToast } from './hooks/useToast';
import { ToastList } from './components/ToastList';
import { useAccent } from './hooks/useAccent';
import './index.css';

function AppContent() {
  const { accent } = useAccent();
  const { toasts, removeToast } = useToast();

  useEffect(() => {
    // Инициализация темы и акцента
    document.documentElement.style.setProperty('--accent', accent);
  }, [accent]);

    return (
      <>
        <SettingsSyncManager />
        {AMBIENT_SEASON === 'spring' ? <SpringPetals /> : <Snowfall />}
        <NodePage />
        <SyncManager />
        <ToastList toasts={toasts} onRemove={removeToast} />
      </>
    );
}

function App() {
  return (
    <LanguageProvider>
      <SettingsProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </SettingsProvider>
    </LanguageProvider>
  );
}

export default App;

